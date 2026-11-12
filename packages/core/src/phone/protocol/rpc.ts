// What the phone asks the Mac and what the Mac answers (ADR-0027, the request layer): a request
// names a call and an id, the response carries that id with the call's result or an error, and an
// update is a change the Mac pushes on its own. Each travels as one sealed message (envelope.ts),
// cut into parts when it does not fit one box (chunk.ts).
import { z } from 'zod';
import { queuedMessage, steerCalls, steerResults } from './steer.js';

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
});
export type PhoneDetail = z.infer<typeof phoneDetail>;

/** The calls the Mac answers: the board, one session, marking one read or unread, and steering one (steer.ts). */
export const phoneCall = z.discriminatedUnion('method', [
  z.object({ method: z.literal('sessions') }),
  z.object({ method: z.literal('session'), id: z.string() }),
  z.object({ method: z.literal('mark'), id: z.string(), unread: z.boolean() }),
  ...steerCalls,
]);
export type PhoneCall = z.infer<typeof phoneCall>;

/** Each call's result, checked by the side that asked. */
export const callResults = {
  sessions: z.object({ rows: z.array(phoneRow) }),
  session: phoneDetail,
  mark: z.object({}),
  ...steerResults,
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
