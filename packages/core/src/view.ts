import type { SessionRow } from './sessions/board/rows.js';

// How Mesa shows a session row and its numbers to a person, the same in `mesa sessions` and on
// the Board. Pure, and with type imports only, so the app bundles it as `@mesa/core/view`.

/** A session's name when a person gave it one, else its id. */
export const sessionLabel = (s: SessionRow) => (s.managed && s.name ? s.name : s.id);

/** The branch a Mesa session runs on (its worktree's), or will once it starts (a queued one's). */
export const sessionBranch = (s: SessionRow) =>
  s.managed ? (s.worktree?.branch ?? s.pending?.branch) : undefined;

/** What a queued session shows in place of its output. */
export const waitingOn = (after: string | undefined) => `waiting on ${after}`;

/** Seconds as `42s`, `5m03s`, or `2h07m`. */
export function duration(seconds: number): string {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${two(m)}m`;
  return m ? `${m}m${two(s)}s` : `${s}s`;
}

/** What an adapter's answer cost at list price, as ` (list price $0.0123)`; nothing when free. */
export const listPrice = (costUsd: number | undefined) =>
  costUsd === undefined ? '' : ` (list price $${costUsd.toFixed(4)})`;
