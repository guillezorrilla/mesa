import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError, toFail } from '../lib/result.js';
import { localDay, obsidianDateTime, validLocalDay } from '../lib/time.js';
import { meaningfulReceipt } from '../receipts/policy.js';
import { listReceipts, receiptLogLine } from '../receipts/store.js';
import { parseNote, serializeNote } from '../vault/frontmatter.js';
import { dailyNotePath, VAULT } from '../vault/layout.js';
import {
  appendLog,
  type LockedNotesDeps,
  oneLine,
  refuseLocked,
  requireLog,
} from '../vault/notes.js';
import { receiptLink } from '../vault/receipt-file.js';
import { outOfScope, vaultFile } from '../vault/scope.js';
import { VAULT_INIT_MARK } from '../vault/vault.js';
import { withVaultLock } from '../vault/vault-lock.js';

const START = '<!-- mesa:daily:start -->';
const END = '<!-- mesa:daily:end -->';
const EXPLICIT = '<!-- mesa:log -->';
export type DailyResult = {
  path: string;
  date: string;
  changed: boolean;
  decisions: number;
  changes: number;
  log: number;
};

/** Validate frontmatter without serializing the bytes that belong to the person. */
function preflight(file: string, raw: Buffer) {
  const text = `${raw.toString('utf8').replace(/\r\n/g, '\n')}\n`;
  try {
    if (text.startsWith('---\n') && text.indexOf('\n---\n', 3) === -1)
      throw new Error('missing closing frontmatter fence');
    const note = parseNote(text);
    if (typeof note.frontmatter !== 'object' || Array.isArray(note.frontmatter))
      throw new Error('frontmatter must be a mapping');
    refuseLocked(file, note);
  } catch (error) {
    if (error instanceof MesaError) throw error;
    throw new MesaError(
      'invalid_config',
      `${file} has malformed frontmatter: ${toFail(error).error.message}`,
    );
  }
}

/** The exact byte ranges outside the generated section, or an append point with no markers. */
function section(raw: Buffer) {
  const start = raw.indexOf(START);
  const end = raw.indexOf(END);
  if (start === -1 && end === -1) return { before: raw, after: Buffer.alloc(0), append: true };
  if (
    start === -1 ||
    end < start ||
    raw.indexOf(START, start + START.length) !== -1 ||
    raw.indexOf(END, end + END.length) !== -1
  ) {
    throw new MesaError('invalid_config', 'daily note needs one ordered mesa:daily start/end pair');
  }
  return { before: raw.subarray(0, start), after: raw.subarray(end + END.length), append: false };
}

function prepare(deps: LockedNotesDeps, date: string) {
  const logFile = requireLog(deps.vault);
  const logRaw = readFileSync(logFile);
  preflight(logFile, logRaw);
  const path = dailyNotePath(date);
  const file = vaultFile(deps.vault, path);
  const raw = existsSync(file) ? readFileSync(file) : undefined;
  if (raw) preflight(file, raw);
  const at = obsidianDateTime(deps.clock());
  const source =
    raw ??
    Buffer.from(
      serializeNote({
        frontmatter: { created: at, updated: at, source: 'mesa', type: 'daily', date },
        body: `# ${date}\n\n`,
      }),
    );
  return { path, file, raw, ...section(source) };
}

/** Only the lock owner calls this: rebuild after a log append without taking another lock. */
function rebuild(
  deps: LockedNotesDeps,
  date: string,
  note: ReturnType<typeof prepare>,
): DailyResult {
  const all = listReceipts(deps.vault, Number.POSITIVE_INFINITY);
  const automatic = new Set(all.map((entry) => oneLine(receiptLogLine(entry.summary, entry.path))));
  const seen = new Set<string>();
  const decisions: string[] = [];
  const changes: string[] = [];
  for (const entry of all.reverse()) {
    const r = entry.receipt;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const at = new Date(r.started);
    if (localDay(at) !== date || !meaningfulReceipt(r)) continue;
    const target =
      typeof r.outputs.target === 'string' && !outOfScope(deps.vault, r.outputs.target)
        ? ` [target](<../${r.outputs.target
            .split('/')
            .map((part) => encodeURIComponent(part).replaceAll('(', '%28').replaceAll(')', '%29'))
            .join('/')}>)`
        : '';
    const line = `- ${obsidianDateTime(at).slice(11)} ${oneLine(entry.summary)} ${receiptLink(entry.path)}${target}`;
    (r.kind === 'vault-change' ? changes : decisions).push(line);
  }
  const outside = new Set(
    [note.before, note.after].flatMap((raw) => raw.toString('utf8').split(/\r?\n/)),
  );
  const logs = readFileSync(requireLog(deps.vault), 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^- (\S+) (.*)$/);
      const [, started = '', text = ''] = match ?? [];
      if (!match || localDay(new Date(started)) !== date) return [];
      const explicit = text.endsWith(` ${EXPLICIT}`);
      if (!explicit && (text === VAULT_INIT_MARK || automatic.has(text) || outside.has(line)))
        return [];
      return [explicit ? line.slice(0, -EXPLICIT.length - 1) : line];
    });
  const block = `${START}\n## Decisions\n\n${decisions.join('\n')}\n\n## Vault changes\n\n${changes.join('\n')}\n\n## Log\n\n${logs.join('\n')}\n${END}`;
  const separator = note.append && note.before.length && note.before.at(-1) !== 10 ? '\n\n' : '';
  const next = Buffer.concat([
    note.before,
    Buffer.from(separator + block + (note.append ? '\n' : '')),
    note.after,
  ]);
  const changed = !note.raw?.equals(next);
  if (changed) {
    mkdirSync(dirname(note.file), { recursive: true });
    writeFileAtomic(note.file, next);
  }
  return {
    path: note.path,
    date,
    changed,
    decisions: decisions.length,
    changes: changes.length,
    log: logs.length,
  };
}

function dateOf(deps: LockedNotesDeps, date = localDay(deps.clock())) {
  if (!validLocalDay(date)) throw new MesaError('usage', '--date must be a real local YYYY-MM-DD');
  return date;
}

/** A standalone rebuild takes the same lock as an explicit log event. */
export async function buildDaily(deps: LockedNotesDeps, input?: string): Promise<DailyResult> {
  const date = dateOf(deps, input);
  requireLog(deps.vault);
  return withVaultLock(deps, async () => rebuild(deps, date, prepare(deps, date)));
}

/** Preflight both destinations, then append once and rebuild under one hold of the lock. */
export async function logLine(
  deps: LockedNotesDeps,
  text: string,
): Promise<{ entry: string; daily: string }> {
  const clean = oneLine(text);
  if (!clean) throw new MesaError('usage', 'a log line needs some text');
  requireLog(deps.vault);
  return withVaultLock(deps, async () => {
    // One event instant keeps the log timestamp and Daily date together across local midnight.
    const at = deps.clock();
    const logging = { ...deps, clock: () => at };
    const date = dateOf(logging);
    const note = prepare(logging, date);
    const entry = appendLog(logging, `${clean} ${EXPLICIT}`);
    try {
      rebuild(logging, date, note);
    } catch (error) {
      throw new MesaError(
        'internal',
        `log.md persisted but ${note.path} rebuild failed; run mesa daily without logging again: ${toFail(error).error.message}`,
        { persisted: [VAULT.log], daily: note.path, entry },
      );
    }
    return { entry, daily: note.path };
  });
}

/** The profile's Daily and explicit log share their lock and private unlocked rebuild. */
export const dailyService = (ctx: MesaContext) => ({
  daily: { build: (date?: string) => buildDaily(ctx.notes(), date) },
  log: (text: string) => logLine(ctx.notes(), text),
});
