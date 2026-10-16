/**
 * A project's sessions in its saved card order (CONTEXT.md, Session order): those it names first,
 * in its order, then the rest as given, so a new session joins at the end.
 */
export function orderSessions<T extends { id: string }>(
  sessions: readonly T[],
  order: readonly string[],
): T[] {
  const rank = (id: string) => {
    const at = order.indexOf(id);
    return at < 0 ? order.length : at;
  };
  return [...sessions].sort((a, b) => rank(a.id) - rank(b.id));
}

/** `ids` with `id` moved to `index`, counted among the others and clamped to the ends. */
export function moveSession(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((each) => each !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}
