import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { type Agent, AgentSchema } from './agents.js';
import type { Clock } from './clock.js';
import { BackendSchema } from './config.js';
import { parseNote } from './frontmatter.js';
import { type IdSource, ULID } from './ids.js';
import { appendLog, NOTE_FIELDS, type NotesDeps, updateNote, writeNote } from './notes.js';
import { RECEIPT_TYPES, receiptLink, receiptPath, receiptSortKey } from './receipt-file.js';
import { MesaError, toFail } from './result.js';
import { NoteTimeSchema, obsidianDateTime } from './time.js';
import { acceptsMesaWrites } from './vault.js';
import { parseWith } from './yaml-file.js';

const probability = z.number().min(0).max(1);

/**
 * One Faro answer, shaped by its primitive (ADR-0004): Choice and Score keep per-option or
 * per-level probabilities and a confidence; Noul keeps its one calibrated probability.
 */
const DecisionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    question: z.string(),
    kind: z.literal('Choice'),
    answer: z.string(),
    probabilities: z.record(z.string(), probability),
    confidence: probability,
    backend: BackendSchema,
  }),
  z.strictObject({
    question: z.string(),
    kind: z.literal('Score'),
    answer: z.number(),
    probabilities: z.record(z.string(), probability),
    confidence: probability,
    backend: BackendSchema,
  }),
  z.strictObject({
    question: z.string(),
    kind: z.literal('Noul'),
    answer: z.boolean(),
    probabilities: probability,
    backend: BackendSchema,
  }),
]);

/** The receipt frontmatter, documented field by field in docs/receipts.md. */
export const ReceiptSchema = z.strictObject({
  type: z.enum(RECEIPT_TYPES),
  id: z.string().regex(ULID, 'must be a ULID'),
  profile: z.string(),
  project: z.string().optional(),
  session: z.string().optional(),
  agent: AgentSchema.optional(),
  started: NoteTimeSchema,
  ended: NoteTimeSchema.optional(),
  status: z.enum(['ok', 'failed', 'blocked']),
  /** The mesa command line, key values redacted. */
  command: z.string(),
  decisions: z.array(DecisionSchema).default([]),
  inputs: z.record(z.string(), z.unknown()).default({}),
  outputs: z.record(z.string(), z.unknown()).default({}),
  /** In US dollars, for information (for example `total_cost_usd` from `claude -p`). */
  cost: z.number().min(0).optional(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;
export type ReceiptInput = Omit<z.input<typeof ReceiptSchema>, 'id' | 'started'> & {
  started?: string;
  /** The body's first line. */
  summary: string;
  /** Markdown under `## Details`. */
  details?: string;
};

export type ReceiptsDeps = { vault: string; clock: Clock; newId: IdSource };

export const DEFAULT_RECEIPT_LIMIT = 20;

/**
 * Validates and writes one receipt through writeNote, so it is atomic like every Mesa note, then
 * appends a log.md line linking to it. With no log.md yet (a receipt from mesa init before mesa
 * vault init), the receipt still stands and `warning` says the line is missing.
 */
export function writeReceipt(
  deps: ReceiptsDeps,
  input: ReceiptInput,
): { receipt: Receipt; path: string; warning?: string } {
  const { summary, details, ...fields } = input;
  const at = deps.clock();
  const started = fields.started ?? obsidianDateTime(at);
  const receipt = parseWith(ReceiptSchema, { ...fields, id: deps.newId(), started }, 'receipt');
  // The file name keeps the clock's seconds, which the minute-precision `started` drops.
  const path = receiptPath({ ...receipt, started: fields.started ?? at.toISOString() });
  const body = `${summary}\n\n## Details\n\n${details ?? 'None.'}\n`;
  const notes = { vault: deps.vault, clock: deps.clock };
  writeNote(notes, { path, frontmatter: receipt, body });
  try {
    // Brackets in the summary cannot open or close a link of their own before the receipt's.
    appendLog(notes, `${summary.replace(/\[\[|\]\]/g, '')} ${receiptLink(path)}`);
    return { receipt, path };
  } catch (error) {
    return { receipt, path, warning: `no log line: ${toFail(error).error.message}` };
  }
}

/**
 * Marks the session's receipt (the one `mesa open` or `mesa resume` wrote) ended at `ended`, and
 * merges `outputs` into it, under the vault lock. Undefined when the session has no receipt.
 */
export async function closeSessionReceipt(
  deps: NotesDeps,
  session: string,
  ended: Date,
  outputs: Record<string, unknown>,
): Promise<{ id: string; path: string } | undefined> {
  // ponytail: reads every receipt to find the session's; index them by session if vaults grow big.
  // The oldest: the receipt of the open or resume that started it, not the stop's own.
  const entry = listReceipts(deps.vault, Number.POSITIVE_INFINITY)
    .filter(
      (e) =>
        e.receipt.type === 'session' && e.receipt.session === session && e.receipt.status === 'ok',
    )
    .at(-1);
  if (!entry) return undefined;
  await updateNote(deps, entry.path, (note = { frontmatter: {}, body: '' }) => {
    const fields = Object.fromEntries(
      Object.entries(note.frontmatter).filter(([k]) => !NOTE_FIELDS.includes(k)),
    );
    const before = (fields.outputs ?? {}) as Record<string, unknown>;
    const next = { ...fields, ended: obsidianDateTime(ended), outputs: { ...before, ...outputs } };
    // Validated as writeReceipt validates, so an update cannot leave a receipt Mesa cannot read.
    return { ...note, frontmatter: parseWith(ReceiptSchema, next, entry.path) };
  });
  return { id: entry.receipt.id, path: entry.path };
}

/** Every receipt file, newest first; files whose names are not a receipt's are left out. */
function receiptFiles(vault: string): string[] {
  const root = join(vault, 'receipts');
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((p) => ({ p, key: receiptSortKey(basename(p)) }))
    .filter((f): f is { p: string; key: string } => f.key !== undefined)
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((f) => join('receipts', f.p));
}

/** A receipt as read back: where it is, its frontmatter, and its body's first line. */
export type ReceiptEntry = { path: string; receipt: Receipt; summary: string; body: string };

function readReceipt(vault: string, path: string): ReceiptEntry {
  const note = parseNote(readFileSync(join(vault, path), 'utf8'));
  const fields = Object.fromEntries(
    Object.entries(note.frontmatter).filter(([k]) => !NOTE_FIELDS.includes(k)),
  );
  const receipt = parseWith(ReceiptSchema, fields, join(vault, path));
  return { path, receipt, summary: note.body.split('\n', 1)[0] ?? '', body: note.body };
}

/** The newest `limit` receipts with their frontmatter. */
export const listReceipts = (vault: string, limit = DEFAULT_RECEIPT_LIMIT): ReceiptEntry[] =>
  receiptFiles(vault)
    .slice(0, limit)
    .map((path) => readReceipt(vault, path));

export function showReceipt(vault: string, id: string): ReceiptEntry {
  const path = receiptFiles(vault).find((p) => p.endsWith(`-${id}.md`));
  if (!path) throw new MesaError('not_found', `no receipt with id ${id}; see mesa receipts`);
  return readReceipt(vault, path);
}

/** `text` with every secret of 4 characters or more replaced by `***`. */
export const redactText = (text: string, secrets: readonly string[]) =>
  secrets.filter((s) => s.length >= 4).reduce((t, secret) => t.split(secret).join('***'), text);

/**
 * A long text an action took (send's prompt, open's goal) as its receipt keeps it: key values
 * redacted first, then the first 80 characters, in `inputs` and in the argv word that is the text
 * (or `--flag=<text>`).
 */
export function receiptText(text: string, argv: readonly string[], secrets: readonly string[]) {
  const short = Array.from(redactText(text, secrets)).slice(0, 80).join('');
  const shorten = (word: string) =>
    word === text || word.endsWith(`=${text}`)
      ? word.slice(0, word.length - text.length) + short
      : word;
  return { short, argv: text ? argv.map(shorten) : argv };
}

/**
 * The command line as a receipt records it: `mesa` plus argv, with `***` for the value after a
 * `keys` or `keys.<name>` path and for every occurrence of a key value (`secrets`) in any word.
 * Values shorter than four characters are left alone, so they cannot blank ordinary words.
 */
export function redactCommand(argv: readonly string[], secrets: readonly string[] = []): string {
  const quote = (word: string) => (/^[\w./:=@*-]+$/.test(word) ? word : JSON.stringify(word));
  const scrub = (word: string) => redactText(word, secrets);
  const words = argv.map((arg, i) => {
    const previous = argv[i - 1] ?? '';
    return previous === 'keys' || previous.startsWith('keys.') ? '***' : quote(scrub(arg));
  });
  return ['mesa', ...words].join(' ');
}

/** What one action's receipt says, given the action's result. */
export type ActionSpec<T> = {
  /** `action` unless the work is a session's. */
  type?: 'action' | 'session';
  summary: (result: T) => string;
  /** The summary when the action throws. */
  failure: string;
  inputs: Record<string, unknown>;
  /** The argv to record instead of the invocation's (send shortens its prompt). */
  argv?: readonly string[];
  outputs?: (result: T) => Record<string, unknown>;
  project?: (result: T) => string | undefined;
  session?: (result: T) => string | undefined;
  agent?: (result: T) => Agent | undefined;
  /** False when the action changed nothing: then no receipt. */
  changed?: (result: T) => boolean;
};

/** The action's result, the receipt it left (if any), and why there is none when writing failed. */
export type Recorded<T> = {
  result: T;
  receipt: { id: string; path: string } | null;
  warning?: string;
};

/**
 * Runs actions, sync or async, and records each as a receipt (`action` unless the spec says
 * `session`). A failed action is recorded `failed` (best effort) and rethrown. A receipt never
 * fails the action it records: when the vault cannot take one, the result carries a warning.
 */
export function actionRecorder(deps: {
  profile: string;
  /** The vault path, or undefined when the profile has none yet. */
  vault: () => string | undefined;
  clock: Clock;
  newId: IdSource;
  /** The redacted command line of `argv`, else of this invocation. */
  command: (argv?: readonly string[]) => string;
}) {
  // Everything here is guarded: a receipt problem never escapes into the action's outcome.
  const write = (
    input: Omit<ReceiptInput, 'profile' | 'command'>,
    argv?: readonly string[],
  ): Omit<Recorded<unknown>, 'result'> => {
    try {
      const vault = deps.vault();
      if (!vault) return { receipt: null, warning: 'no receipt: the profile has no vault yet' };
      if (!acceptsMesaWrites(vault)) {
        return {
          receipt: null,
          warning: `no receipt: ${vault} is not a vault; run mesa vault init`,
        };
      }
      const { receipt, path, warning } = writeReceipt(
        { vault, clock: deps.clock, newId: deps.newId },
        { profile: deps.profile, command: deps.command(argv), ...input },
      );
      return { receipt: { id: receipt.id, path }, ...(warning ? { warning } : {}) };
    } catch (error) {
      return { receipt: null, warning: `no receipt: ${toFail(error).error.message}` };
    }
  };

  const failed = <T>(spec: ActionSpec<T>, error: unknown) => {
    write(
      {
        type: spec.type ?? 'action',
        status: 'failed',
        summary: spec.failure,
        inputs: spec.inputs,
        outputs: { error: toFail(error).error },
      },
      spec.argv,
    );
    return error;
  };
  const succeeded = <T>(spec: ActionSpec<T>, result: T): Recorded<T> => {
    if (spec.changed && !spec.changed(result)) return { result, receipt: null };
    const written = write(
      {
        type: spec.type ?? 'action',
        status: 'ok',
        summary: spec.summary(result),
        project: spec.project?.(result),
        session: spec.session?.(result),
        agent: spec.agent?.(result),
        inputs: spec.inputs,
        outputs: spec.outputs?.(result) ?? {},
      },
      spec.argv,
    );
    return { result, ...written };
  };

  function record<T>(spec: ActionSpec<T>, action: () => Promise<T>): Promise<Recorded<T>>;
  function record<T>(spec: ActionSpec<T>, action: () => T): Recorded<T>;
  function record<T>(spec: ActionSpec<T>, action: () => T | Promise<T>) {
    let result: T | Promise<T>;
    try {
      result = action();
    } catch (error) {
      throw failed(spec, error);
    }
    if (!(result instanceof Promise)) return succeeded(spec, result);
    return result.then(
      (value) => succeeded(spec, value),
      (error) => {
        throw failed(spec, error);
      },
    );
  }
  return record;
}
