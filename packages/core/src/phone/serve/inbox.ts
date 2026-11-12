import type { z } from 'zod';
import type { InboxItem } from '../../notifications/inbox-items.js';
import { type inboxCalls, inboxResults, type PhoneNotice } from '../protocol/inbox.js';
import type { CallResult } from '../protocol/rpc.js';

/** The Inbox functions the CLI uses (`mesa notifications`, `notifications read`). */
export type InboxDeps = { list: () => InboxItem[]; markRead: (id: string) => void };

/** How many notices the phone lists, newest first. */
const NOTICES = 50;

type InboxCall = z.infer<(typeof inboxCalls)[number]>;
export const isInboxCall = (call: { method: string }): call is InboxCall =>
  Object.hasOwn(inboxResults, call.method);

/** A notice cut to what the phone shows and what it opens. */
export const toPhoneNotice = (item: InboxItem): PhoneNotice => ({
  id: item.id,
  kind: item.kind,
  at: item.at,
  title: item.title,
  ...(item.detail ? { detail: item.detail } : {}),
  read: item.read,
  ...(item.target.kind === 'session'
    ? { session: { id: item.target.id, title: item.sessionTitle ?? item.target.id } }
    : {}),
  ...(item.gate ? { gate: item.gate.id } : {}),
});

/** Answers one Inbox call (#1067); throws core's MesaError for an unknown notice. */
export function answerInboxCall(deps: InboxDeps, call: InboxCall): unknown {
  if (call.method === 'inbox')
    return {
      notices: deps.list().slice(0, NOTICES).map(toPhoneNotice),
    } satisfies CallResult<'inbox'>;
  deps.markRead(call.id);
  return {} satisfies CallResult<'noticeRead'>;
}
