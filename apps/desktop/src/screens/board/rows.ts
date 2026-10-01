import type { ManagedRow, SessionRow, TreeRow } from '@mesa/core';
import { FINAL_STATES, listPrice } from '@mesa/core/browser';

// What the Board derives from a row: pure, so every piece of the Board reads it the same way.
// How a row's label, branch, and numbers read, and which states are final or waiting, is core's
// (`@mesa/core/browser`), which the CLI shares.

/**
 * Who placed the row: Faro's backend, and the adapter's list price when it answered; Mesa, for a
 * session that never ran.
 */
export const decidedBy = (d?: { backend: string; costUsd?: number }) =>
  d ? `decided by ${d.backend}${listPrice(d.costUsd)}` : 'set by Mesa: its agent has not run';

/** Its agent has exited: stopped, its window gone, or its pane dead (done or failed). */
export const exited = (s: SessionRow) => !s.alive || FINAL_STATES.has(s.lastState.state);
/** A Mesa session waiting to start (mesa open --after): a Stop cancels it. */
export const queued = (s: SessionRow) => s.managed && s.lastState.state === 'queued';
/** A running or queued Mesa session shown in the Sessions tab. */
export const activeSession = (s: SessionRow) => s.managed && (!exited(s) || queued(s));
/** A row whose clock still runs. */
export const ticking = (s: SessionRow) => !exited(s) && !('endedAt' in s && s.endedAt);
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
