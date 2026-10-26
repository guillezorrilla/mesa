// Whether a person has looked at what a session last did (CONTEXT.md, Unread).

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

/** A person has it open now (`mesa read`): read, and seen at `at`. */
export const markRead = (store: SessionStore, id: string, at: string) =>
  store.update(id, { unread: undefined, seenAt: at });

/** A person wants to come back to it (`mesa unread`): unread until it is opened again. */
export const markUnread = (store: SessionStore, id: string) => store.update(id, { unread: true });
