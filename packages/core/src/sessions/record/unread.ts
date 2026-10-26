// Whether a person has looked at what a session last did (CONTEXT.md, Unread).

import { MesaError } from '../../lib/result.js';
import type { SessionRecord } from './record.js';
import { type SessionState, WAITING_STATES } from './states.js';
import type { SessionStore } from './store.js';

const AT_WORK: ReadonlySet<SessionState> = new Set(['working', ...WAITING_STATES]);
const FINISHED: ReadonlySet<SessionState> = new Set(['idle', 'done', 'failed']);

type LastState = SessionRecord['lastState'];

/** Idle again from a later hook: a turn began and finished between two looks. */
const anotherTurn = (last: LastState, next: LastState) =>
  last.state === 'idle' &&
  next.state === 'idle' &&
  last.source === 'hook' &&
  next.source === 'hook' &&
  next.at > last.at;

/**
 * What a new state adds to the record: unread when it ends its agent's work (a turn finished, or
 * the agent exited or failed while at work). A plain terminal never turns unread, and neither
 * does a fresh agent's first idle (Mesa's launch guess, then its SessionStart).
 */
export const unreadOn = (
  r: Pick<SessionRecord, 'agent' | 'lastState'>,
  next: LastState,
): Pick<SessionRecord, 'unread'> =>
  r.agent !== 'terminal' &&
  ((AT_WORK.has(r.lastState.state) && FINISHED.has(next.state)) || anotherTurn(r.lastState, next))
    ? { unread: true }
    : {};

/** Marks each of `ids` with `patch`, once every one is known: an unknown id refuses them all. */
function markEach(store: SessionStore, ids: readonly string[], patch: Partial<SessionRecord>) {
  const unknown = ids.filter((id) => !store.find(id));
  if (unknown.length) throw new MesaError('not_found', `no session ${unknown.join(', ')}`);
  return [...new Set(ids)].map((id) => store.update(id, patch));
}

/** A person has them open now (`mesa read`): read, and seen at `at`. */
export const markRead = (store: SessionStore, ids: readonly string[], at: string) =>
  markEach(store, ids, { unread: undefined, seenAt: at });

/** A person wants to come back to them (`mesa unread`): unread until each is opened again. */
export const markUnread = (store: SessionStore, ids: readonly string[]) =>
  markEach(store, ids, { unread: true });
