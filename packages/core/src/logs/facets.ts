import type { CloudLogEntry } from './gcp.js';

// The context fields Cloud Logs entries carry, counted (CONTEXT.md, Cloud Logs): the Explorer's
// fields pane and an error group's facets. Pure, so the app bundles it (`@mesa/core/browser`).

export type Facet = { key: string; values: { value: string; count: number }[] };

/** The context fields `entries` carry, the most common first, each with its most common values. */
export function facetsOf(
  entries: readonly Pick<CloudLogEntry, 'fields'>[],
  keys = 6,
  values = 5,
): Facet[] {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of entries)
    for (const [key, value] of Object.entries(entry.fields)) {
      const byValue = counts.get(key) ?? new Map<string, number>();
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
      counts.set(key, byValue);
    }
  const total = (byValue: Map<string, number>) => [...byValue.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .sort((a, b) => total(b[1]) - total(a[1]))
    .slice(0, keys)
    .map(([key, byValue]) => ({
      key,
      values: [...byValue.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, values)
        .map(([value, count]) => ({ value, count })),
    }));
}
