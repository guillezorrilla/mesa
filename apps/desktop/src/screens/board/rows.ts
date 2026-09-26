import type { SessionRow, SessionState, TreeRow } from '@mesa/core';

// What the Board derives from a row: pure, so every piece of the Board reads it the same way.

// ponytail: a copy of duration() in packages/cli/src/output/duration.ts, since the app bundles no
// CLI or core code; change both together, or share one pure module if a third copy appears.
export const running = (seconds: number) => {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${two(m)}m`;
  return m ? `${m}m${two(s)}s` : `${s}s`;
};

/** Who placed the row: Faro's backend, and the adapter's list price when it answered. */
export const decidedBy = (d: { backend: string; costUsd?: number }) =>
  `decided by ${d.backend}${d.costUsd === undefined ? '' : ` (list price $${d.costUsd.toFixed(4)})`}`;

// ponytail: core's FINAL_STATES and WAITING_STATES, copied: the app imports core's types only (it
// reaches Mesa through the bridge), and typing them as SessionState makes a renamed state fail
// typecheck here.
const FINISHED: ReadonlySet<SessionState> = new Set(['done', 'failed']);
export const WAITING: ReadonlySet<SessionState> = new Set([
  'waiting-permission',
  'waiting-question',
]);

/** Its agent has exited: stopped, its window gone, or its pane dead (done or failed). */
export const exited = (s: SessionRow) => !s.alive || FINISHED.has(s.lastState.state);
/** A row whose clock still runs. */
export const ticking = (s: SessionRow) => !exited(s) && !('endedAt' in s && s.endedAt);
/** A Mesa session whose agent has exited and whose conversation can reopen. */
export const resumable = (s: SessionRow) =>
  s.managed && exited(s) && Boolean(s.agentSessionId) && !s.resumedBy;

/**
 * The rows to show, each with the rows below it in the tree (the deeper ones right after it). A
 * collapsed row hides those, and the toggle says how many, and whether one waits on a person.
 */
export function shown(rows: readonly TreeRow[], collapsed: ReadonlySet<string>) {
  const out: { row: TreeRow; below: TreeRow[] }[] = [];
  for (let i = 0; i < rows.length; ) {
    const row = rows[i] as TreeRow;
    let end = i + 1;
    while (end < rows.length && (rows[end] as TreeRow).depth > row.depth) end++;
    out.push({ row, below: rows.slice(i + 1, end) });
    i = collapsed.has(row.id) ? end : i + 1;
  }
  return out;
}

/** When a prompt came: the time today, else the date and time. */
export const when = (at: string) => {
  const date = new Date(at);
  const today = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return today ? time : `${date.toLocaleDateString()} ${time}`;
};
