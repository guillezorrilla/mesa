import type { ManagedRow, SessionRow } from '../../sessions/board/rows.js';
import { sessionTitle } from '../../sessions/record/labels.js';
import type { PhoneRow } from '../protocol/rpc.js';

/**
 * The phone's rows: the board's Mesa sessions, in its attention order, each cut to what a list
 * shows. Foreign sessions stay off: the phone acts on sessions, and those are read-only.
 */
export const phoneRows = (board: readonly SessionRow[]): PhoneRow[] =>
  board.filter((row): row is ManagedRow => row.managed).map(toPhoneRow);

export const toPhoneRow = (row: ManagedRow): PhoneRow => ({
  id: row.id,
  title: sessionTitle(row),
  project: row.project ?? null,
  state: row.lastState.state,
  since: row.lastState.at,
  context: row.context ? Math.round(row.context.used) : null,
  unread: Boolean(row.unread),
});

/**
 * What changed from `before` to `after`: rows new or different, ids no longer listed, and the
 * order now; none when nothing did.
 */
export function rowChanges(before: readonly PhoneRow[], after: readonly PhoneRow[]) {
  const was = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  const now = new Set(after.map((row) => row.id));
  const rows = after.filter((row) => was.get(row.id) !== JSON.stringify(row));
  const gone = before.filter((row) => !now.has(row.id)).map((row) => row.id);
  const order = after.map((row) => row.id);
  const moved = order.join() !== before.map((row) => row.id).join();
  return rows.length || gone.length || moved ? { rows, gone, order } : undefined;
}
