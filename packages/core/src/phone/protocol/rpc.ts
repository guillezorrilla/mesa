// What the phone asks the Mac and what the Mac answers (ADR-0027, the request layer): a request
// names a call and an id, the response carries that id with the call's result or an error, and an
// update is a change the Mac pushes on its own. Each travels as one sealed message (envelope.ts),
// cut into parts when it does not fit one box (chunk.ts).
import { z } from 'zod';
import { changesCalls, changesResults } from './changes.js';
import { crewCalls, crewResults } from './crew.js';
import { inboxCalls, inboxResults } from './inbox.js';
import { prsCalls, prsResults } from './prs.js';
import { pushesCalls, pushesResults } from './pushes.js';
import { queuedMessage, steerCalls, steerResults } from './steer.js';
import { usageCalls, usageResults } from './usage.js';
import { vaultCalls, vaultResults } from './vault.js';

/** One session as the phone lists it: the board row cut to what a list shows (about 200 bytes). */
export const phoneRow = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string().nullable(),
  /** A session state (CONTEXT.md); a string, so a newer Mac's state still reaches an older app. */
  state: z.string(),
  /** When it entered `state`. */
  since: z.string(),
  /** How much of its context window it has used, in percent, once read. */
  context: z.number().nullable(),
  unread: z.boolean(),
  /** A waiting session's pending prompt in one line; none while it waits on none Mesa reads. */
  ask: z.string().optional(),
  /** How many replies wait for its turn to end (CONTEXT.md, Queued message); none when absent. */
  queued: z.number().optional(),
});
export type PhoneRow = z.infer<typeof phoneRow>;

/** A reply's text in order, its fenced code blocks apart so each can be copied. */
export const replySegment = z.object({ code: z.boolean(), text: z.string() });
export type ReplySegment = z.infer<typeof replySegment>;

/** What the session screen shows: the row, its goal, its latest replies and its output tail. */
export const phoneDetail = z.object({
  row: phoneRow,
  goal: z.string().nullable(),
  /** Each reply's id is its text's revision, so a list keeps it across reads. */
  replies: z.array(
    z.object({ id: z.string(), at: z.string().nullable(), segments: z.array(replySegment) }),
  ),
  tail: z.array(z.string()),
  /** Replies waiting for its turn to end; an older Mac sends none. */
  queued: z.array(queuedMessage).default([]),
  /** Archived: off the board, and its menu offers Unarchive. */
  archived: z.boolean().default(false),
});
export type PhoneDetail = z.infer<typeof phoneDetail>;

/** A session's pending prompt (core's PendingPrompt, CONTEXT.md), as the prompt card shows it. */
export const phonePrompt = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    id: z.string(),
    kind: z.enum(['permission', 'question']),
    tool: z.string().optional(),
    summary: z.string(),
    options: z.array(
      z.object({ id: z.string(), label: z.string(), description: z.string().optional() }),
    ),
    freeText: z.boolean(),
  }),
  z.object({ status: z.literal('unsupported'), reason: z.string() }),
]);
export type PhonePrompt = z.infer<typeof phonePrompt>;

/**
 * The calls the Mac answers: the board, one session, marking one read or unread, its pending
 * prompt, answering that prompt (`prompt` is its id, so an answer to an older one is stale), a
 * crew's, steering one (steer.ts), reviewing a session's changes (changes.ts), the Inbox,
 * usage and push settings, the vault's (vault.ts), and pull requests (prs.ts).
 */
export const phoneCall = z.discriminatedUnion('method', [
  z.object({ method: z.literal('sessions') }),
  z.object({ method: z.literal('session'), id: z.string() }),
  z.object({ method: z.literal('mark'), id: z.string(), unread: z.boolean() }),
  z.object({ method: z.literal('prompt'), id: z.string() }),
  z.object({
    method: z.literal('answer'),
    id: z.string(),
    prompt: z.string(),
    option: z.string().optional(),
    text: z.string().max(4000).optional(),
  }),
  ...crewCalls,
  ...inboxCalls,
  ...usageCalls,
  ...pushesCalls,
  ...steerCalls,
  ...changesCalls,
  ...prsCalls,
  ...vaultCalls,
]);
export type PhoneCall = z.infer<typeof phoneCall>;

/** Each call's result, checked by the side that asked. */
export const callResults = {
  sessions: z.object({ rows: z.array(phoneRow) }),
  session: phoneDetail,
  mark: z.object({}),
  prompt: phonePrompt,
  /** Answered, or stale: the session no longer waits on that prompt. */
  answer: z.object({ status: z.enum(['answered', 'stale']) }),
  ...crewResults,
  ...inboxResults,
  ...usageResults,
  ...pushesResults,
  ...steerResults,
  ...changesResults,
  ...prsResults,
  ...vaultResults,
};
export type CallResult<M extends PhoneCall['method']> = z.infer<(typeof callResults)[M]>;

/**
 * The phone's request. Asking for `sessions` also asks for updates (updateMessage) for a while
 * (WATCH_MS), so a phone that stops asking stops costing the Mac and the broker anything.
 */
export const requestMessage = z.object({
  kind: z.literal('request'),
  id: z.string().min(1).max(64),
  call: phoneCall,
});

/** The Mac's answer to the request with this `id`: its result, or why there is none. */
export const responseMessage = z.object({
  kind: z.literal('response'),
  id: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

/**
 * Rows whose slim row changed since the last update, the ids that left the board, and every id
 * in the Mac's attention order now, so a row that moved keeps its rank.
 */
export const updateMessage = z.object({
  kind: z.literal('update'),
  rows: z.array(phoneRow),
  gone: z.array(z.string()),
  order: z.array(z.string()),
});

export type UpdateMessage = z.infer<typeof updateMessage>;

/** How long one `sessions` request keeps updates coming. */
export const WATCH_MS = 120_000;
