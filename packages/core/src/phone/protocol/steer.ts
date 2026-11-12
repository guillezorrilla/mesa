// What the phone sends to steer a session (#1062): a reply, a queued message taken back, a
// session action and the saved prompts. rpc.ts joins these to the other calls.
import { z } from 'zod';

/** A reply the Mac holds for a busy session until its turn ends (CONTEXT.md, Queued message). */
export const queuedMessage = z.object({
  id: z.string(),
  text: z.string(),
  at: z.string(),
  /** Why it could not be typed when the turn ended; it stays until the person removes it. */
  error: z.string().optional(),
});
export type QueuedMessage = z.infer<typeof queuedMessage>;

/** What the session menu does to a session, each through core as its `mesa` command does. */
export const SESSION_ACTIONS = [
  'stop',
  'resume',
  'fork',
  'handoff',
  'rename',
  'archive',
  'unarchive',
] as const;
export type SessionAction = (typeof SESSION_ACTIONS)[number];

/** A prompt's longest text, as saved prompts allow. */
const TEXT_MAX = 20_000;
/**
 * The longest photo, base64: a JPEG of about 420 KB, which the phone resizes under; its request
 * stays inside the 600 KB a payload may be (chunk.ts).
 */
export const IMAGE_MAX = 560_000;

export const steerCalls = [
  /**
   * A reply typed into the session, or queued while it works; `yes` sends past a guardrail ask
   * (Send anyway), and `image` (a JPEG, base64) goes with the text as `mesa image send` sends it.
   */
  z.object({
    method: z.literal('send'),
    id: z.string(),
    text: z.string().max(TEXT_MAX),
    yes: z.boolean().optional(),
    image: z.string().max(IMAGE_MAX).optional(),
  }),
  /** Takes a queued message back before it is typed: the phone removes it, or edits and sends it again. */
  z.object({ method: z.literal('unqueue'), id: z.string(), message: z.string() }),
  /** A session action; `text` is rename's name or handoff's note. */
  z.object({
    method: z.literal('act'),
    id: z.string(),
    action: z.enum(SESSION_ACTIONS),
    text: z.string().max(TEXT_MAX).optional(),
  }),
  z.object({ method: z.literal('prompts') }),
] as const;

/**
 * `sent` typed now, `queued` held until the turn ends; `ask` and `blocked` are the guardrail's,
 * with its reason, and typed nothing.
 */
export const sendResult = z.object({
  status: z.enum(['sent', 'queued', 'ask', 'blocked']),
  reason: z.string().optional(),
});
export type SendResult = z.infer<typeof sendResult>;

export const steerResults = {
  send: sendResult,
  unqueue: z.object({}),
  /** The session a resume, fork or handoff started. */
  act: z.object({ session: z.string().optional() }),
  prompts: z.object({ prompts: z.array(z.object({ name: z.string(), text: z.string() })) }),
};
