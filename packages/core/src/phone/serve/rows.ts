import type { ManagedRow, SessionRow } from '../../sessions/board/rows.js';
import { sessionTitle } from '../../sessions/record/labels.js';
import type { PhoneRow } from '../protocol/rpc.js';

/**
 * The phone's rows: the board's Mesa sessions, in its attention order, each cut to what a list
 * shows. Foreign sessions stay off: the phone acts on sessions, and those are read-only.
 */
export const phoneRows = (board: readonly SessionRow[]): PhoneRow[] =>
  board.filter((row): row is ManagedRow => row.managed).map(phoneRow);

export const phoneRow = (row: ManagedRow): PhoneRow => ({
  id: row.id,
  title: sessionTitle(row),
  project: row.project ?? null,
  state: row.lastState.state,
  since: row.lastState.at,
  context: row.context ? Math.round(row.context.used) : null,
  unread: Boolean(row.unread),
});

/** What changed from `before` to `after`: rows new or different, and ids no longer listed. */
export function rowChanges(before: readonly PhoneRow[], after: readonly PhoneRow[]) {
  const was = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  const now = new Set(after.map((row) => row.id));
  return {
    rows: after.filter((row) => was.get(row.id) !== JSON.stringify(row)),
    gone: before.filter((row) => !now.has(row.id)).map((row) => row.id),
  };
}
