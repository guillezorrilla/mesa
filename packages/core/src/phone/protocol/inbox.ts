// What the phone asks about the Mac's Inbox (#1067): its notices with their read state, and
// marking one read. rpc.ts adds these calls to phoneCall and their results.
import { z } from 'zod';

/** A notice as the phone lists it, with what it opens: a session or a gate. */
export const phoneNotice = z.object({
  id: z.string(),
  /** An Inbox kind (core's InboxItem); a string, so a newer Mac's kind still reaches. */
  kind: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  read: z.boolean(),
  /** The session it names, with that session's title. */
  session: z.object({ id: z.string(), title: z.string() }).optional(),
  /** The open decision gate it asks about. */
  gate: z.string().optional(),
});
export type PhoneNotice = z.infer<typeof phoneNotice>;

/** The Inbox calls, which rpc.ts adds to phoneCall. */
export const inboxCalls = [
  z.object({ method: z.literal('inbox') }),
  z.object({ method: z.literal('noticeRead'), id: z.string() }),
] as const;

/** Each Inbox call's result, which rpc.ts adds to callResults. */
export const inboxResults = {
  /** Newest first. */
  inbox: z.object({ notices: z.array(phoneNotice) }),
  noticeRead: z.object({}),
};
