import type { SessionRow } from './sessions/board/rows.js';

// How Mesa shows a session row and its numbers to a person, the same in `mesa sessions` and on
// the Board. Pure, and with type imports only, so the app bundles it (`@mesa/core/browser`).

/** A session's name when a person gave it one, else its id. */
export const sessionLabel = (s: SessionRow) => (s.managed && s.name ? s.name : s.id);

/** The branch a Mesa session runs on (its worktree's), or will once it starts (a queued one's). */
export const sessionBranch = (s: SessionRow) =>
  s.managed ? (s.worktree?.branch ?? s.pending?.branch) : undefined;

/** A number of sessions as it reads: `1 session`, `2 sessions`. */
export const sessionCount = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

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

/** A share of 1 as a whole percent: a state's confidence, `95%`. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** A session's attention score (0 to 1) as it reads: `0.83`. */
export const attentionScore = (attention: number) => attention.toFixed(2);

/** How full a session's context is, as the whole percent shown: 0 to 100 whatever the reading. */
export const contextPercent = (used: number) => Math.round(Math.min(100, Math.max(0, used)));
