/**
 * Each status category's name, in the order a ticket list ranks its groups; a name heads a group
 * only for tickets with no status of their own.
 */
export const CATEGORIES = {
  indeterminate: 'In progress',
  new: 'To do',
  done: 'Done',
} as const;

export type StatusGroup<T> = { id: string; status: string; category: string; rows: T[] };

const RANK = Object.keys(CATEGORIES);
/** A category this version does not know ranks after the known ones. */
const rank = (category: string) => (RANK.indexOf(category) + RANK.length + 1) % (RANK.length + 1);

/**
 * The tickets grouped by their own status name (Ready apart from In Progress, though Jira files
 * both as in progress), by category (CATEGORIES) and then by name, the tracker's order within one.
 */
// ponytail: names order the statuses of one category; the workflow's own order needs each
// tracker's board configuration, a read (and for Jira a scope) Mesa does not have yet.
export function groupByStatus<T extends { status: string; category: string }>(
  tickets: readonly T[],
): StatusGroup<T>[] {
  const groups = new Map<string, StatusGroup<T>>();
  for (const ticket of tickets) {
    const { category } = ticket;
    const status = ticket.status || (CATEGORIES as Record<string, string>)[category] || category;
    const id = `${category}:${status.toLowerCase()}`;
    const group = groups.get(id) ?? { id, status, category, rows: [] };
    groups.set(id, group);
    group.rows.push(ticket);
  }
  return [...groups.values()].sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      a.status.localeCompare(b.status, undefined, { sensitivity: 'base' }),
  );
}
