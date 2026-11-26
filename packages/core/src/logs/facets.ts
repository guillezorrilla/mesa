import type { CloudLogEntry } from './gcp.js';

// The context fields Cloud Logs entries carry, counted (CONTEXT.md, Cloud Logs): the Explorer's
// fields pane and an error group's facets. Pure, so the app bundles it (`@mesa/core/browser`).

export type Facet = { key: string; values: { value: string; count: number }[] };

/**
 * A field as the Explorer's fields pane shows it: how many entries carry it, its distinct values
 * (all, the most common first), and its tier: `main` (the app's own context, such as company or
 * status), `more` (plumbing such as a logger, a revision or a host), or `unique` (nearly every value
 * its own, such as an id or a timestamp), shown only when searched for.
 */
export type FieldStat = Facet & { present: number; tier: 'main' | 'more' | 'unique' };

/** Words of a key that name where an entry came from rather than what it is about. */
const PLUMBING = new Set(
  'logger log thread revision version host hostname pod instance class caller file line level severity process pid'.split(
    ' ',
  ),
);

/** Whether `key` names plumbing: one of its words (split at dots, dashes, underscores and capitals) does. */
const isPlumbing = (key: string) =>
  key.split(/[._-]+|(?<=[a-z])(?=[A-Z])/).some((word) => PLUMBING.has(word.toLowerCase()));

/** Each field `entries` carry, with every value's count. */
function counted(entries: readonly Pick<CloudLogEntry, 'fields'>[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of entries)
    for (const [key, value] of Object.entries(entry.fields)) {
      const byValue = counts.get(key) ?? new Map<string, number>();
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
      counts.set(key, byValue);
    }
  return [...counts.entries()].map(([key, byValue]) => ({
    key,
    present: [...byValue.values()].reduce((a, b) => a + b, 0),
    values: [...byValue.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count })),
  }));
}

/** The context fields `entries` carry, the most common first, each with its most common values. */
export function facetsOf(
  entries: readonly Pick<CloudLogEntry, 'fields'>[],
  keys = 6,
  values = 5,
): Facet[] {
  return counted(entries)
    .sort((a, b) => b.present - a.present)
    .slice(0, keys)
    .map(({ key, values: all }) => ({ key, values: all.slice(0, values) }));
}

const TIERS = ['main', 'more', 'unique'] as const;

/** Every field `entries` carry, by tier (main, more, unique), then by how many carry it. */
export function fieldStats(entries: readonly Pick<CloudLogEntry, 'fields'>[]): FieldStat[] {
  return counted(entries)
    .map((field) => ({
      ...field,
      tier:
        field.values.length > 10 && field.values.length >= 0.9 * field.present
          ? ('unique' as const)
          : isPlumbing(field.key)
            ? ('more' as const)
            : ('main' as const),
    }))
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.present - a.present);
}
