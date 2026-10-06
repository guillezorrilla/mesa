import type { ManagedRow, SessionRow } from '../board/rows.js';
import type { SessionRecord } from './record.js';
import { FINAL_STATES, WAITING_STATES } from './states.js';

// Where a session is in its life (CONTEXT.md, Session): over, exited, queued, active, waiting,
// resumable, recoverable, and whether Review reads it (reviewable). Pure, importing only pure
// modules, so the app bundles it (`@mesa/core/browser`).

/** Its agent is through: stopped, or seen done or failed. A queue waits for this (CONTEXT.md, Queued session). */
export const isOver = (r: Pick<SessionRecord, 'endedAt' | 'lastState'>) =>
  Boolean(r.endedAt) || FINAL_STATES.has(r.lastState.state);

/** Its agent has exited: stopped, its window gone, or its pane dead (done or failed). */
export const exited = (s: SessionRow) => !s.alive || FINAL_STATES.has(s.lastState.state);
/** A Mesa session waiting to start (mesa open --after): a Stop cancels it. */
export const queued = (s: SessionRow) => s.managed && s.lastState.state === 'queued';
/** A running or queued Mesa session shown in the Sessions tab. */
export const activeSession = (s: SessionRow) => s.managed && (!exited(s) || queued(s));
/** A session in the Sessions tab that waits for input: what the visual alert counts. */
export const waitingForInput = (s: SessionRow) =>
  activeSession(s) && WAITING_STATES.has(s.lastState.state);
/** A Mesa session with an interactive agent, whose native responses Review reads. */
export const reviewable = (s: SessionRow): s is ManagedRow =>
  s.managed && s.kind === 'interactive' && s.agent !== 'terminal';
/** A Mesa session whose agent has exited and whose conversation can reopen. */
export const resumable = (s: SessionRow) =>
  s.managed && exited(s) && Boolean(s.agentSessionId) && !s.resumedBy;
/** A saved run with no usable terminal that has not been explicitly ended or hidden. */
export const recoverable = (s: SessionRow): s is ManagedRow =>
  s.managed &&
  exited(s) &&
  !s.backgroundId &&
  !s.endedAt &&
  !s.archivedAt &&
  !s.resumedBy &&
  !queued(s);
