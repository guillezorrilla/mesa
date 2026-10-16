/**
 * A project's sessions in its saved card order (CONTEXT.md, Session order): those it names first,
 * in its order, then the rest as given, so a new session joins at the end.
 */
export function orderSessions<T extends { id: string }>(
  sessions: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, at) => [id, at]));
  const of = (id: string) => rank.get(id) ?? order.length;
  return [...sessions].sort((a, b) => of(a.id) - of(b.id));
}

/** `ids` with `id` moved to `index`, counted among the others and clamped to the ends. */
export function moveSession(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((each) => each !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

/** `projects` with `project`'s session order set to `ids`, the others as they are. */
export function withSessionOrder<T extends { name: string; sessionOrder: string[] }>(
  projects: readonly T[],
  project: string,
  ids: string[],
): T[] {
  return projects.map((row) => (row.name === project ? { ...row, sessionOrder: ids } : row));
}
