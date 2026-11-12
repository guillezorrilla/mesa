import type { PhoneRow, UpdateMessage } from '@mesa/core/phone';
import { GROUP_TITLES, type Group, groupOf } from './sessionState';

export type RowFilter = { query: string; project?: string; unreadOnly: boolean };

/** The listing with each update the Mac pushed since applied in order: changed rows, gone ids. */
export function applyUpdates(rows: readonly PhoneRow[], updates: readonly UpdateMessage[]) {
  let out = [...rows];
  for (const update of updates) {
    const changed = new Map(update.rows.map((row) => [row.id, row]));
    const gone = new Set(update.gone);
    out = out.filter((row) => !gone.has(row.id)).map((row) => changed.get(row.id) ?? row);
    const known = new Set(out.map((row) => row.id));
    out.push(...update.rows.filter((row) => !known.has(row.id)));
  }
  return out;
}

/** The rows a filter keeps: the query in the title or project, the project, unread only. */
export function filterRows(rows: readonly PhoneRow[], filter: RowFilter) {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!query || `${row.title} ${row.project ?? ''}`.toLowerCase().includes(query)) &&
      (!filter.project || row.project === filter.project) &&
      (!filter.unreadOnly || row.unread),
  );
}

/** Needs you, Working, Done, each in the Mac's attention order, empty groups left out. */
export function groupRows(rows: readonly PhoneRow[]) {
  const groups: Group[] = ['needs-you', 'working', 'done'];
  return groups
    .map((group) => ({
      key: group,
      title: GROUP_TITLES[group],
      data: rows.filter((row) => groupOf(row.state) === group),
    }))
    .filter((section) => section.data.length);
}

/** The projects the rows name, sorted, for the project filter. */
export const projectsOf = (rows: readonly PhoneRow[]) =>
  [...new Set(rows.flatMap((row) => (row.project ? [row.project] : [])))].sort();
