import type { TicketView } from './views.js';

/** What a view asks Jira, before its narrowing: the sprints a board view found, else its query. */
export function baseJql(view: TicketView, sprintIds: readonly number[] = []): string {
  if (view.filter) return `filter = ${view.filter}`;
  if (view.jql) return view.jql;
  return sprintIds.length === 1
    ? `sprint = ${sprintIds[0]}`
    : `sprint in (${sprintIds.join(', ')})`;
}

/**
 * `base` narrowed as `view` says (only the person's tickets, none done, unless it turns them
 * off), ordered by `base`'s own ORDER BY, else the board's rank for a board view and the most
 * recently updated first for the rest.
 */
// ponytail: the first ORDER BY splits the query, even one inside a quoted value.
export function viewJql(view: TicketView, base: string): string {
  const at = base.search(/\border\s+by\b/i);
  const query = (at < 0 ? base : base.slice(0, at)).trim();
  const order =
    at < 0 ? (view.board ? 'ORDER BY Rank ASC' : 'ORDER BY updated DESC') : base.slice(at);
  const clauses = [
    `(${query})`,
    ...(view.everyone ? [] : ['assignee = currentUser()']),
    ...(view.showDone ? [] : ['statusCategory != Done']),
  ];
  return `${clauses.join(' AND ')} ${order.trim()}`;
}
