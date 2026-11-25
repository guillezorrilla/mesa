import type { CloudErrorGroup, Incident, IncidentLink } from '@mesa/core';

/** How the Errors list sorts: by count, newest last seen, or biggest rise over the range. */
export type ErrorSort = 'count' | 'newest' | 'rise';

/** How much a group's counts rose: its last quarter against the rest, per bucket. */
export function rise(group: CloudErrorGroup) {
  const spark = group.spark ?? [];
  const cut = Math.max(1, Math.floor(spark.length * 0.75));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return mean(spark.slice(cut)) - mean(spark.slice(0, cut));
}

const score = (sort: ErrorSort, groups: CloudErrorGroup[]) =>
  sort === 'count'
    ? groups.reduce((sum, g) => sum + g.count, 0)
    : sort === 'newest'
      ? Math.max(...groups.map((g) => Date.parse(g.lastSeen) || 0))
      : Math.max(...groups.map(rise));

/** A group with its key. */
export type KeyedGroup = { key: string; group: CloudErrorGroup };
/** An item of the Errors list: an incident with its groups (the origin first), or a group alone. */
export type ErrorItem =
  | { kind: 'incident'; incident: Incident; members: KeyedGroup[] }
  | ({ kind: 'group' } & KeyedGroup);

/**
 * The Errors list: incidents and the groups in none, sorted by `sort` (each item scored once);
 * with `newOnly`, only what holds a New group.
 */
export function errorItems(
  byKey: ReadonlyMap<string, CloudErrorGroup>,
  incidents: Incident[],
  sort: ErrorSort,
  newOnly: boolean,
) {
  const linked = new Set(incidents.flatMap((i) => i.groups));
  const items: ErrorItem[] = [
    ...incidents.map((incident) => ({
      kind: 'incident' as const,
      incident,
      members: incident.groups.flatMap((key) => {
        const group = byKey.get(key);
        return group ? [{ key, group }] : [];
      }),
    })),
    ...[...byKey]
      .filter(([key]) => !linked.has(key))
      .map(([key, group]) => ({ kind: 'group' as const, key, group })),
  ];
  const groupsOf = (item: ErrorItem) =>
    item.kind === 'incident' ? item.members.map((m) => m.group) : [item.group];
  return items
    .filter((item) => !newOnly || groupsOf(item).some((g) => g.badge === 'new'))
    .map((item) => ({ item, score: score(sort, groupsOf(item)) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** The groups linked to `key` in `incidents`, each with the link that ties them. */
export function relatedOf(
  key: string,
  incidents: Incident[],
  byKey: ReadonlyMap<string, CloudErrorGroup>,
) {
  return incidents
    .flatMap((i) => i.links)
    .filter((link) => link.from === key || link.to === key)
    .flatMap((link: IncidentLink) => {
      const other = link.from === key ? link.to : link.from;
      const group = byKey.get(other);
      return group ? [{ link, other: group, key: other }] : [];
    });
}
