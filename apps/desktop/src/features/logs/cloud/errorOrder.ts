import type { CloudErrorGroup, Incident } from '@mesa/core';

/** How the Errors list sorts: by count, newest last seen, or biggest rise over the range. */
export type ErrorSort = 'count' | 'newest' | 'rise';

/** How much a group's counts rose: its last quarter against the rest, per bucket. */
export function rise(group: CloudErrorGroup) {
  const spark = group.spark ?? [];
  const cut = Math.max(1, Math.floor(spark.length * 0.75));
  const before = spark.slice(0, cut);
  const after = spark.slice(cut);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return mean(after) - mean(before);
}

const score = (sort: ErrorSort, groups: CloudErrorGroup[]) =>
  sort === 'count'
    ? groups.reduce((sum, g) => sum + g.count, 0)
    : sort === 'newest'
      ? Math.max(...groups.map((g) => Date.parse(g.lastSeen) || 0))
      : Math.max(...groups.map(rise));

/** An item of the Errors list: an incident with its groups, or a group alone. */
export type ErrorItem =
  | { kind: 'incident'; incident: Incident; groups: CloudErrorGroup[] }
  | { kind: 'group'; key: string; group: CloudErrorGroup };

/**
 * The Errors list: incidents and the groups in none, sorted by `sort`; with `newOnly`, only what
 * holds a New group.
 */
export function errorItems(
  groups: CloudErrorGroup[],
  incidents: Incident[],
  sort: ErrorSort,
  newOnly: boolean,
) {
  const key = (g: CloudErrorGroup) => `${g.project} ${g.id}`;
  const byKey = new Map(groups.map((g) => [key(g), g]));
  const linked = new Set(incidents.flatMap((i) => i.groups));
  const items: ErrorItem[] = [
    ...incidents.map((incident) => ({
      kind: 'incident' as const,
      incident,
      groups: incident.groups.flatMap((k) =>
        byKey.has(k) ? [byKey.get(k) as CloudErrorGroup] : [],
      ),
    })),
    ...groups
      .filter((g) => !linked.has(key(g)))
      .map((group) => ({ kind: 'group' as const, key: key(group), group })),
  ];
  const groupsOf = (item: ErrorItem) => (item.kind === 'incident' ? item.groups : [item.group]);
  return items
    .filter((item) => !newOnly || groupsOf(item).some((g) => g.badge === 'new'))
    .sort((a, b) => score(sort, groupsOf(b)) - score(sort, groupsOf(a)));
}
