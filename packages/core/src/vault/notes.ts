import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createFileAtomic, writeFileAtomic } from '../lib/atomic-file.js';
import type { Clock } from '../lib/clock.js';
import type { LockDeps } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { obsidianDateTime } from '../lib/time.js';
import { type Frontmatter, type Note, parseNote, serializeNote } from './frontmatter.js';
import { VAULT } from './layout.js';
import { vaultFile, vaultWriteFile } from './scope.js';
import { withVaultLock } from './vault-lock.js';

/** Where notes go: the vault root and the clock that stamps them. */
export type NotesDeps = { vault: string; clock: Clock };
/** For a change under the vault lock: `sleep` waits between tries for it. */
export type LockedNotesDeps = NotesDeps & LockDeps & { sleep: (ms: number) => Promise<void> };

/** The frontmatter fields writeNote owns; a caller's value for one is dropped. */
const NOTE_FIELDS = ['created', 'updated', 'source'];

/** A note's own frontmatter: the fields writeNote does not manage. */
export const ownFields = (frontmatter: Frontmatter): Frontmatter =>
  Object.fromEntries(Object.entries(frontmatter).filter(([k]) => !NOTE_FIELDS.includes(k)));

const readIfExists = (file: string) =>
  existsSync(file) ? parseNote(readFileSync(file, 'utf8')) : undefined;

/** The note at `path` (relative to the vault); not_found when there is none. */
export function readNote(vault: string, path: string): Note {
  const note = readIfExists(vaultFile(vault, path));
  if (!note) throw new MesaError('not_found', `no note at ${path} in ${vault}`);
  return note;
}

/** Refuses to replace a note whose frontmatter says `locked: true`: it is the person's. */
export function refuseLocked(file: string, note: Note | undefined): void {
  if (note?.frontmatter.locked === true) {
    throw new MesaError('locked', `${file} is locked (locked: true in its frontmatter)`, {
      reason: 'note',
    });
  }
}

/**
 * Refuses a save over a note that is the person's: a locked one (refuseLocked), or one Mesa did
 * not write (no `source: mesa`), which is `locked` too, its reason `not-mesa`.
 */
export function refuseForeign(file: string, note: Note | undefined): void {
  refuseLocked(file, note);
  if (note && note.frontmatter.source !== 'mesa') {
    throw new MesaError('locked', `${file} is not a note Mesa wrote (no source: mesa)`, {
      reason: 'not-mesa',
    });
  }
}

/**
 * Writes a note at `path` (relative to the vault) atomically. The frontmatter gets `created` (kept
 * from the note it replaces), `updated`, and `source` (`mesa`, or the Source an Import snapshot
 * came from), then the caller's fields. A note whose frontmatter says `locked: true` is never
 * replaced.
 */
export function writeNote(deps: NotesDeps, note: { path: string } & Note, source = 'mesa'): Note {
  const project =
    typeof note.frontmatter.project === 'string' ? note.frontmatter.project : undefined;
  const file = vaultWriteFile(deps.vault, note.path, project);
  const previous = readIfExists(file);
  refuseLocked(file, previous);
  const frontmatter = stamped(deps, note.frontmatter, source, previous?.frontmatter.created);
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, serializeNote({ frontmatter, body: note.body }));
  return { frontmatter, body: note.body };
}

/** writeNote for a new note: created whole (createFileAtomic), or false when `path` exists. */
export function createNote(deps: NotesDeps, note: { path: string } & Note): boolean {
  const project =
    typeof note.frontmatter.project === 'string' ? note.frontmatter.project : undefined;
  const file = vaultWriteFile(deps.vault, note.path, project);
  mkdirSync(dirname(file), { recursive: true });
  const frontmatter = stamped(deps, note.frontmatter, 'mesa');
  return createFileAtomic(file, serializeNote({ frontmatter, body: note.body }));
}

/** A note's frontmatter as Mesa writes it: `created` (or `now`), `updated`, `source`, then its own. */
function stamped(deps: NotesDeps, fields: Frontmatter, source: string, created?: unknown) {
  const now = obsidianDateTime(deps.clock());
  return { created: created ?? now, updated: now, source, ...ownFields(fields) } as Frontmatter;
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
export const updateNote = (deps: LockedNotesDeps, path: string, change: Change): Promise<Note> =>
  withVaultLock(deps, () => rewrite(deps, path, change));

/** The vault's log.md; not_found until `mesa vault init` has run. */
export function requireLog(vault: string): string {
  const file = vaultFile(vault, VAULT.log);
  if (!existsSync(file)) throw new MesaError('not_found', `${file} not found; run mesa vault init`);
  return file;
}

/** `text` as one line: its newlines, and the spaces around them, collapse to one space. */
export const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/**
 * Appends `- <ISO> <line>` to the vault's log.md with one append-mode write. The line stays one
 * line (oneLine), so text cannot forge a second entry.
 */
export function appendLog(deps: NotesDeps, line: string): string {
  const text = oneLine(line);
  if (!text) throw new MesaError('usage', 'a log line needs some text');
  const file = requireLog(deps.vault);
  const entry = `- ${deps.clock().toISOString()} ${text}`;
  const previous = readFileSync(file);
  const separator = previous.length && previous.at(-1) !== 10 ? '\n' : '';
  appendFileSync(file, `${separator}${entry}\n`);
  return entry;
}
