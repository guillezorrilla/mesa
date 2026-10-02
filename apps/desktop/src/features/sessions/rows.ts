import type { ManagedRow, SessionRow } from '@mesa/core';
import { FINAL_STATES, WAITING_STATES } from '@mesa/core/browser';

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
