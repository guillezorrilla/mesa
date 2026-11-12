// The phone's calls for reviewing a session's changes (#1063): its diff file by file and page by
// page, notes on lines and on a reply's passage, source control, and its worktree's files. rpc.ts
// joins them to the other calls.
import { z } from 'zod';

const session = { id: z.string() };

/** One changed file of a session's diff, with a revision that changes when its patch does. */
export const changedFile = z.object({
  path: z.string(),
  added: z.number(),
  removed: z.number(),
  rev: z.string(),
});
export type ChangedFile = z.infer<typeof changedFile>;

/** A file in the checkout's Git status: its index and working-tree codes, as `git status` prints them. */
export const statusFile = z.object({
  path: z.string(),
  index: z.string(),
  workingTree: z.string(),
});
export type StatusFile = z.infer<typeof statusFile>;

/** What a note or a quote became: delivered, or why not (the guardrail's word, or a failure). */
const noteDelivery = z.object({ status: z.string(), reason: z.string().optional() });
export type NoteDelivery = z.infer<typeof noteDelivery>;

export const changesCalls = [
  /** The session's changed files against its base. */
  z.object({ method: z.literal('changes'), ...session }),
  /** One page of one file's patch lines, from line `from`, of the patch with revision `rev`. */
  z.object({
    method: z.literal('diff'),
    ...session,
    path: z.string(),
    rev: z.string(),
    from: z.number().int().nonnegative(),
  }),
  /** A note on new-side lines `line` to `end` of `path` (0 for the whole file), sent at once. */
  z.object({
    method: z.literal('note'),
    ...session,
    path: z.string(),
    line: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    text: z.string().min(1),
  }),
  /** A comment on a passage of the reply with this revision, sent through `review send`. */
  z.object({
    method: z.literal('quote'),
    ...session,
    revision: z.string(),
    passage: z.string().min(1),
    comment: z.string().min(1),
  }),
  z.object({ method: z.literal('status'), ...session }),
  z.object({ method: z.literal('stage'), ...session, path: z.string(), staged: z.boolean() }),
  /** A commit message for the staged changes, written by an agent. */
  z.object({ method: z.literal('message'), ...session }),
  z.object({ method: z.literal('commit'), ...session, message: z.string().min(1) }),
  z.object({ method: z.literal('sync'), ...session, action: z.enum(['push', 'pull']) }),
  z.object({ method: z.literal('branches'), ...session }),
  z.object({ method: z.literal('switch'), ...session, name: z.string().min(1) }),
  z.object({ method: z.literal('files'), ...session }),
  /** Files whose name, or whose text, holds `query`. */
  z.object({
    method: z.literal('search'),
    ...session,
    query: z.string().min(1),
    mode: z.enum(['name', 'content']),
  }),
  z.object({ method: z.literal('file'), ...session, path: z.string() }),
] as const;
export type ChangesCall = z.infer<(typeof changesCalls)[number]>;

const changesMethods = new Set<string>(changesCalls.map((call) => call.shape.method.value));
/** Whether `call` is one of the change calls. */
export const isChangesCall = (call: { method: string }): call is ChangesCall =>
  changesMethods.has(call.method);

export const changesResults = {
  changes: z.object({
    base: z.string(),
    branch: z.string().nullable(),
    files: z.array(changedFile),
    /** Untracked files past the cap, left out. */
    omitted: z.number(),
  }),
  diff: z.object({
    lines: z.array(z.string()),
    /** Where the page starts: the patch line, and the line numbers there (DiffAt). */
    from: z.number(),
    at: z.object({ old: z.number(), new: z.number(), inHunk: z.boolean() }),
    /** How many patch lines the file has. */
    total: z.number(),
  }),
  note: noteDelivery,
  quote: noteDelivery,
  status: z.object({ branch: z.string().nullable(), files: z.array(statusFile) }),
  stage: z.object({}),
  message: z.object({ message: z.string() }),
  commit: z.object({ oid: z.string() }),
  sync: z.object({ remote: z.string(), upstream: z.string() }),
  branches: z.object({ current: z.string().nullable(), names: z.array(z.string()) }),
  switch: z.object({}),
  files: z.object({
    entries: z.array(z.object({ path: z.string(), dir: z.boolean() })),
    truncated: z.boolean(),
  }),
  search: z.object({
    hits: z.array(z.object({ path: z.string(), line: z.number(), preview: z.string() })),
  }),
  file: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string() }),
    z.object({ kind: z.literal('image'), mime: z.string(), data: z.string() }),
  ]),
};
