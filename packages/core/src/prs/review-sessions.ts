import type { SessionReview } from '../sessions/record/record.js';
import { FINAL_STATES, type SessionState } from '../sessions/record/states.js';

// Which sessions review a pull request, and who may post one: pure, for core and the app alike.

/** Post now publishes through mesa prs publish, which only Claude's deny rules guard (ADR-0024). */
export const canPost = (agent: string | null | undefined) => agent === 'claude';

/**
 * Review sessions of `project`'s pull request `pr` among `sessions`, oldest round first, and the
 * newest of them `live` says is still running: it is opened, not started again.
 */
export function reviewsOf<T extends { project?: string | null; review?: SessionReview | null }>(
  sessions: readonly T[],
  project: string,
  pr: number,
  live: (session: T) => boolean,
) {
  const all = sessions
    .filter((s) => s.project === project && s.review?.pr === pr)
    .sort((a, b) => (a.review?.round ?? 0) - (b.review?.round ?? 0));
  return { all, live: all.filter(live).at(-1) };
}

/** A review round in progress by its state: queued, or its agent working or asking me. */
export const roundInProgress = (state: SessionState) =>
  state !== 'idle' && !FINAL_STATES.has(state);

/**
 * A review round in progress: its session queued to start, or alive with its agent working or
 * asking me something. An idle agent is through with the round, though its session stays open.
 */
export const reviewing = (s: { alive: boolean; lastState: { state: SessionState } }) =>
  (s.alive || s.lastState.state === 'queued') && roundInProgress(s.lastState.state);
