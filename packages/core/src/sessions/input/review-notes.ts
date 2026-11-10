import { join } from 'node:path';
import { z } from 'zod';
import { readWorkspaceFile, textOf } from '../../files/editor.js';
import { mustGit } from '../../git/command.js';
import { literalPath, relativeFilePath } from '../../git/path.js';
import type { Clock } from '../../lib/clock.js';
import { type IdSource, shortId } from '../../lib/ids.js';
import { changeJson, readJson } from '../../lib/json-file.js';
import type { LockDeps } from '../../lib/lock-file.js';
import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import type { Checkout } from '../../projects/checkout.js';

/** Which diff a note is on: the Session diff against its base, or uncommitted work. */
export const NOTE_SCOPES = ['branch', 'working', 'staged'] as const;
export type NoteScope = (typeof NOTE_SCOPES)[number];

const Note = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  /** First and last 1-based line on the diff's new side; both 0 for a note on the whole file. */
  line: z.number().int().min(0),
  end: z.number().int().min(0),
  scope: z.enum(NOTE_SCOPES),
  text: z.string().min(1),
  /** The lines as they read when the note was written; empty for a file note. */
  quoted: z.string(),
  /** The Git blob of the file the note was written on. */
  blob: z.string().min(1),
  at: z.string(),
  sentAt: z.string().optional(),
});
export type ReviewNote = z.infer<typeof Note>;
/** A note as it reads now: at the lines its quote is on, and `stale` when that quote is gone. */
export type ListedNote = ReviewNote & { stale: boolean };

const Notes = z.strictObject({ notes: z.array(Note).default([]) }).describe('review notes');

/** A session's notes, one file under the profile's review-notes/ (CONTEXT.md, Review note). */
export const reviewNotesFile = (dir: string, session: string) => join(dir, `${session}.json`);

/** A file as a scope holds it now: its text and Git blob. */
export type NoteFile = { text: string; blob: string };

export type NotesDeps = {
  dir: string;
  lock: LockDeps;
  clock: Clock;
  newId: IdSource;
  run: Runner;
  /** The session's checkout, where its agent works now. */
  checkout: () => Promise<Checkout>;
};

/** `path` as `scope` holds it: the index's copy when staged, else the working tree's. */
async function readNoteFile(
  run: Runner,
  checkout: Checkout,
  scope: NoteScope,
  path: string,
): Promise<NoteFile | undefined> {
  const git = (args: string[]) => mustGit(run, checkout.path, args, `cannot read ${path} from Git`);
  if (scope === 'staged') {
    const entry = (await git(['ls-files', '--stage', '-z', '--', literalPath(path)])).match(
      /^\d+ ([0-9a-f]{40,64}) 0\t/,
    );
    if (!entry) return undefined;
    const blob = entry[1] as string;
    // shortcut: the runner decodes stdout, so a non-UTF-8 index copy reaches textOf as U+FFFD; read bytes if notes on such files matter.
    return { text: textOf(Buffer.from(await git(['cat-file', 'blob', blob])), path), blob };
  }
  let text: string;
  try {
    text = readWorkspaceFile(checkout, path).text;
  } catch (error) {
    if (error instanceof MesaError && error.code === 'not_found') return undefined;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return { text, blob: (await git(['hash-object', '--', relativeFilePath(path)])).trim() };
}

export type ReviewNoteInput = {
  path: string;
  line: number;
  end?: number;
  scope?: NoteScope;
  text: string;
};

const linesOf = (text: string) => text.replace(/\n$/, '').split('\n');

function checkedText(text: string): string {
  if (!text.trim() || text.includes('\0') || Buffer.byteLength(text) > 4 << 10)
    throw new MesaError('usage', 'a note must be 1-4096 bytes and contain no NUL');
  return text;
}

/** Where `note`'s quote is in `file` now: its own lines, else the one place they moved to. */
function placed(note: ReviewNote, file: NoteFile | undefined): ListedNote {
  if (!file) return { ...note, stale: true };
  if (note.line === 0 || file.blob === note.blob) return { ...note, stale: false };
  const lines = linesOf(file.text);
  const span = note.end - note.line + 1;
  const at = (start: number) => lines.slice(start, start + span).join('\n') === note.quoted;
  if (at(note.line - 1)) return { ...note, stale: false };
  // A blank quote would match every blank line; it only stays where it was.
  if (!note.quoted.trim()) return { ...note, stale: true };
  const found = lines.flatMap((_, start) => (at(start) ? [start] : []));
  return found.length === 1
    ? { ...note, line: (found[0] as number) + 1, end: (found[0] as number) + span, stale: false }
    : { ...note, stale: true };
}

/**
 * A session's review notes: drafts on exact lines of its diff, kept until sent, each quoting the
 * lines it is on so a later read can tell they changed.
 */
export function reviewNotes(deps: NotesDeps, session: string) {
  const file = reviewNotesFile(deps.dir, session);
  let checkout: Promise<Checkout> | undefined;
  const readFile = async (scope: NoteScope, path: string) => {
    checkout ??= deps.checkout();
    return readNoteFile(deps.run, await checkout, scope, path);
  };
  const change = (fn: (notes: ReviewNote[]) => ReviewNote[]) =>
    changeJson(file, Notes, (current) => ({ notes: fn(current?.notes ?? []) }), deps.lock).notes;
  const mustHave = (notes: ReviewNote[], id: string) => {
    if (!notes.some((n) => n.id === id))
      throw new MesaError('not_found', `session ${session} has no review note ${id}`);
  };
  return {
    list: async (): Promise<ListedNote[]> => {
      const notes = readJson(file, Notes)?.notes ?? [];
      const reads = new Map<string, Promise<NoteFile | undefined>>();
      const read = (note: ReviewNote) => {
        const key = `${note.scope}\0${note.path}`;
        if (!reads.has(key))
          reads.set(
            key,
            readFile(note.scope, note.path).catch(() => undefined),
          );
        return reads.get(key) as Promise<NoteFile | undefined>;
      };
      return Promise.all(notes.map(async (note) => placed(note, await read(note))));
    },
    add: async (input: ReviewNoteInput): Promise<ReviewNote> => {
      const scope = input.scope ?? 'branch';
      if (!NOTE_SCOPES.includes(scope))
        throw new MesaError('usage', `scope must be one of ${NOTE_SCOPES.join(', ')}`);
      if (!input.path) throw new MesaError('usage', 'a note needs a file path');
      const end = input.end ?? input.line;
      if (!Number.isSafeInteger(input.line) || !Number.isSafeInteger(end) || input.line < 0)
        throw new MesaError('usage', 'line and end must be whole numbers, line 0 for the file');
      if (input.line === 0 ? end !== 0 : end < input.line)
        throw new MesaError('usage', 'end must be at or after line, and absent on a file note');
      const text = checkedText(input.text);
      const found = await readFile(scope, input.path);
      if (!found) throw new MesaError('usage', `${input.path} is not in the ${scope} checkout`);
      const lines = linesOf(found.text);
      if (end > lines.length)
        throw new MesaError('usage', `${input.path} has ${lines.length} lines`);
      const quoted = input.line ? lines.slice(input.line - 1, end).join('\n') : '';
      if (Buffer.byteLength(quoted) > 8 << 10)
        throw new MesaError('usage', 'the lines a note quotes must be under 8 KiB');
      const note: ReviewNote = {
        id: shortId(deps.newId),
        path: input.path,
        line: input.line,
        end,
        scope,
        text,
        quoted,
        blob: found.blob,
        at: deps.clock().toISOString(),
      };
      change((notes) => [...notes, note]);
      return note;
    },
    /** A new text; the note is unsent again. */
    edit: (id: string, text: string): ReviewNote => {
      checkedText(text);
      const notes = change((notes) => {
        mustHave(notes, id);
        return notes.map((n) => {
          if (n.id !== id) return n;
          const { sentAt: _sent, ...rest } = n;
          return { ...rest, text };
        });
      });
      return notes.find((n) => n.id === id) as ReviewNote;
    },
    remove: (id: string): { id: string } => {
      change((notes) => {
        mustHave(notes, id);
        return notes.filter((n) => n.id !== id);
      });
      return { id };
    },
  };
}
