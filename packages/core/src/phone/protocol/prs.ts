// The phone's calls for pull requests (#1064): the review queue in Mesa's buckets, one PR with its
// description, threads, drafts and checks, its files as the diff viewer pages them, starting a
// review session, discarding a draft, replying to and resolving a thread, merging, and sending a
// failed check to the session that owns the branch. rpc.ts joins them to the other calls.
import { z } from 'zod';
import { MERGE_METHODS } from '../../prs/merge-methods.js';
import { changesResults } from './changes.js';

const pr = { project: z.string(), number: z.number().int().positive() };

/** One PR as the queue lists it; `bucket` is a Review bucket (CONTEXT.md), a string like a state. */
export const phonePr = z.object({
  ...pr,
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  bucket: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
export type PhonePr = z.infer<typeof phonePr>;

/** One check on the head commit (core's PrCheck). */
export const phoneCheck = z.object({
  name: z.string(),
  state: z.enum(['passing', 'failing', 'pending', 'skipped']),
  url: z.string().optional(),
});
export type PhoneCheck = z.infer<typeof phoneCheck>;

/** One of my threads, with the verdict a re-review gave it (CONTEXT.md, Comment verdict). */
export const phoneThread = z.object({
  id: z.string(),
  path: z.string(),
  line: z.number().nullable(),
  body: z.string(),
  resolved: z.boolean(),
  lastReply: z.object({ author: z.string(), body: z.string() }).optional(),
  verdict: z.string().optional(),
});
export type PhoneThread = z.infer<typeof phoneThread>;

/** One of my Pending drafts (CONTEXT.md, Pending draft); no path is the review summary. */
export const phoneDraft = z.object({
  id: z.string(),
  path: z.string().nullable(),
  line: z.number().nullable(),
  body: z.string(),
});
export type PhoneDraft = z.infer<typeof phoneDraft>;

/** The PR in full, the session working on its branch, and its live review session, if any. */
export const phonePrDetail = phonePr.extend({
  provider: z.string(),
  state: z.string(),
  body: z.string(),
  base: z.string(),
  additions: z.number(),
  deletions: z.number(),
  /** How many files it changes; absent from a Mac before #1134. */
  files: z.number().int().nonnegative().optional(),
  checks: z.enum(['passing', 'failing', 'pending']).nullable(),
  checkList: z.array(phoneCheck),
  threads: z.array(phoneThread),
  drafts: z.array(phoneDraft),
  /** The live session whose worktree is on the PR's branch, which a failed check is sent to. */
  owner: z.string().nullable(),
  /** The live review session of this PR: its id, Leave as drafts or Post now, and if at work. */
  review: z.object({ session: z.string(), mode: z.string(), working: z.boolean() }).nullable(),
});
export type PhonePrDetail = z.infer<typeof phonePrDetail>;

export const prsCalls = [
  z.object({ method: z.literal('prs') }),
  z.object({ method: z.literal('pr'), ...pr }),
  /** The PR's changed files, each with the revision its pages are read at. */
  z.object({ method: z.literal('prChanges'), ...pr }),
  /** One page of one file's patch lines, as the `diff` call pages a session's. */
  z.object({
    method: z.literal('prDiff'),
    ...pr,
    path: z.string(),
    rev: z.string(),
    from: z.number().int().nonnegative(),
  }),
  /** Starts a review session; `post` is Post now, under which the session publishes its drafts. */
  z.object({ method: z.literal('prStart'), ...pr, post: z.boolean() }),
  z.object({ method: z.literal('prDiscard'), ...pr, draft: z.string() }),
  /** A reply in one of my threads, left as a Pending draft. */
  z.object({
    method: z.literal('prReply'),
    ...pr,
    thread: z.string(),
    text: z.string().min(1).max(4000),
  }),
  z.object({ method: z.literal('prResolve'), ...pr, thread: z.string(), resolved: z.boolean() }),
  /** Merges through core's merge; `confirm` is the person's yes over failing checks or a conflict. */
  z.object({
    method: z.literal('prMerge'),
    ...pr,
    how: z.enum(MERGE_METHODS),
    confirm: z.boolean(),
  }),
  /** Forwards the PR's events, its failed checks among them, to the session on its branch. */
  z.object({ method: z.literal('prSend'), ...pr }),
] as const;
export type PrsCall = z.infer<(typeof prsCalls)[number]>;

const prsMethods = new Set<string>(prsCalls.map((call) => call.shape.method.value));
/** Whether `call` is one of the PR calls. */
export const isPrsCall = (call: { method: string }): call is PrsCall => prsMethods.has(call.method);

export const prsResults = {
  prs: z.object({
    prs: z.array(phonePr),
    /** Projects whose gh or twg is not ready, and repos that failed to read, in words. */
    problems: z.array(z.string()),
  }),
  pr: phonePrDetail,
  /** As a session's `changes`: the PR's branch against its base. */
  prChanges: changesResults.changes,
  prDiff: changesResults.diff,
  prStart: z.object({ session: z.string(), existing: z.boolean(), mode: z.string() }),
  prDiscard: z.object({}),
  prReply: z.object({ id: z.string() }),
  prResolve: z.object({ resolved: z.boolean() }),
  /** Merged at `head`, or refused until confirmed: a conflict with its base, or a failing check. */
  prMerge: z.union([
    z.object({ how: z.string(), head: z.string() }),
    z.object({ refused: z.enum(['conflicting', 'checks-failing']) }),
  ]),
  /** Typed into the session, waiting on it (busy, or Mesa unsure it is idle), or nothing to send. */
  prSend: z.object({
    status: z.string(),
    session: z.string().optional(),
    reason: z.string().optional(),
  }),
};
