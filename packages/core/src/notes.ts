import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { writeFileAtomic } from './atomic-file.js';
import type { Clock } from './clock.js';
import { type Frontmatter, type Note, parseNote, serializeNote } from './frontmatter.js';
import { MesaError } from './result.js';
import { withVaultLock } from './vault-lock.js';

/** Where notes go: the vault root and the clock that stamps them. */
export type NotesDeps = { vault: string; clock: Clock };

/** The frontmatter fields writeNote owns; a caller's value for one is dropped. */
export const NOTE_FIELDS = ['created', 'updated', 'source'];

/** The absolute file for a vault-relative note path; a path that leaves the vault is refused. */
export function vaultFile(vault: string, path: string): string {
  const file = resolve(vault, path);
  const inside = relative(vault, file);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new MesaError('usage', `note path ${path} is outside the vault`);
  }
  return file;
}

const readIfExists = (file: string) =>
  existsSync(file) ? parseNote(readFileSync(file, 'utf8')) : undefined;

export function readNote(deps: NotesDeps, path: string): Note {
  const note = readIfExists(vaultFile(deps.vault, path));
  if (!note) throw new MesaError('not_found', `no note at ${path} in ${deps.vault}`);
  return note;
}

/**
 * Writes a note at `path` (relative to the vault) atomically. The frontmatter gets `created` (kept
 * from the note it replaces), `updated`, and `source: mesa`, then the caller's fields. A note
 * whose frontmatter says `locked: true` is never replaced.
 */
export function writeNote(deps: NotesDeps, note: { path: string } & Note): Note {
  const file = vaultFile(deps.vault, note.path);
  const previous = readIfExists(file);
  if (previous?.frontmatter.locked === true) {
    throw new MesaError('locked', `${file} is locked (locked: true in its frontmatter)`, {
      reason: 'note',
    });
  }
  const now = deps.clock().toISOString();
  const fields = Object.fromEntries(
    Object.entries(note.frontmatter).filter(([k]) => !NOTE_FIELDS.includes(k)),
  );
  const frontmatter: Frontmatter = {
    created: previous?.frontmatter.created ?? now,
    updated: now,
    source: 'mesa',
    ...fields,
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, serializeNote({ frontmatter, body: note.body }));
  return { frontmatter, body: note.body };
}

type Change = (current: Note | undefined) => Note | Promise<Note>;

// The read-modify-write itself; callers hold the vault lock.
async function rewrite(deps: NotesDeps, path: string, change: Change): Promise<Note> {
  const current = readIfExists(vaultFile(deps.vault, path));
  return writeNote(deps, { path, ...(await change(current)) });
}

/**
 * Read-modify-write of one shared note under the vault lock, so concurrent updates are never
 * lost. `change` gets the current note (undefined if there is none) and returns the new one.
 */
export const updateNote = (deps: NotesDeps, path: string, change: Change): Promise<Note> =>
  withVaultLock(deps.vault, () => rewrite(deps, path, change));

/** The vault's log.md; not_found until `mesa vault init` has run. */
function requireLog(vault: string): string {
  const file = join(vault, 'log.md');
  if (!existsSync(file)) throw new MesaError('not_found', `${file} not found; run mesa vault init`);
  return file;
}

/**
 * Appends `- <ISO> <line>` to the vault's log.md with one append-mode write. The line stays one
 * line: newlines collapse to spaces, so text cannot forge a second entry.
 */
export function appendLog(deps: NotesDeps, line: string): string {
  const text = line.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (!text) throw new MesaError('usage', 'a log line needs some text');
  const file = requireLog(deps.vault);
  const entry = `- ${deps.clock().toISOString()} ${text}`;
  appendFileSync(file, `${entry}\n`);
  return entry;
}

/** The local calendar date of `date` as YYYY-MM-DD, the daily note's name. */
export const localDay = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, '0'))
    .join('-');

/**
 * `mesa log`: the line goes to log.md and to today's daily note (created with frontmatter when
 * missing), both under one hold of the vault lock, so a busy lock writes neither.
 */
export function logLine(deps: NotesDeps, text: string): Promise<{ entry: string; daily: string }> {
  requireLog(deps.vault); // before the lock, which would otherwise create .mesa/ in a bare folder
  const day = localDay(deps.clock());
  const daily = `daily/${day}.md`;
  return withVaultLock(deps.vault, async () => {
    const entry = appendLog(deps, text);
    await rewrite(deps, daily, (note) => ({
      frontmatter: { type: 'daily', date: day, ...note?.frontmatter },
      body: `${note?.body ?? `# ${day}\n\n`}${entry}\n`,
    }));
    return { entry, daily };
  });
}
