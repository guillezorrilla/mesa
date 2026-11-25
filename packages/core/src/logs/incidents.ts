import { splitMessage } from './cloud-entry.js';
import { facetsOf } from './facets.js';
import type { CloudLogEntry } from './gcp.js';
import { normalizedMessage } from './groups.js';
import { requestIds } from './tokens.js';

// Incidents (CONTEXT.md, Cloud Logs): error groups that belong to one failure, linked in core by
// what their entries share, each link with its reason and strength. Pure, so the app bundles it.

/** Why two groups are linked. */
export type LinkReason = 'trace' | 'request' | 'context' | 'revision' | 'counts';
/** Two groups (by key) linked for `reason`, with what they share and how strongly (0 to 1). */
export type IncidentLink = {
  from: string;
  to: string;
  reason: LinkReason;
  detail: string;
  strength: number;
};
/** Linked groups: their services, when the first started, the likely origin, and every link. */
export type Incident = {
  id: string;
  groups: string[];
  origin: string;
  started: string;
  services: string[];
  links: IncidentLink[];
};
/** A group as incidents read it: its key, message, services and the entries read for it. */
export type IncidentGroup = {
  key: string;
  message: string;
  services: string[];
  entries: readonly CloudLogEntry[];
};

/** Links at least this strong put two groups in one incident. */
export const LINK_THRESHOLD = 0.4;
/** Context keys too broad to tie two failures together. */
const BROAD = new Set([
  'env',
  'environment',
  'level',
  'severity',
  'region',
  'zone',
  'cluster',
  'namespace',
  'logger',
  'thread',
]);
/** A message a gateway or proxy prints for an upstream's failure: a symptom, not an origin. */
const GATEWAY = /\b50[234]\b|bad gateway|gateway time-?out|upstream/i;
/** The per-minute counts two groups need to be compared, and how alike they must be. */
const COUNT_BUCKETS = 3;
const CORRELATION = 0.8;

const traceOf = (entry: CloudLogEntry) => entry.trace?.split('/').at(-1) ?? null;

/** The values `pick` gives `entries`, each with the share of entries that hold it. */
function shares(entries: readonly CloudLogEntry[], pick: (e: CloudLogEntry) => string[]) {
  const counts = new Map<string, number>();
  for (const entry of entries)
    for (const value of new Set(pick(entry))) counts.set(value, (counts.get(value) ?? 0) + 1);
  return new Map([...counts].map(([value, n]) => [value, n / Math.max(entries.length, 1)]));
}

/** Pearson's correlation of two series of the same length; 0 when either is flat. */
function correlation(a: readonly number[], b: readonly number[]) {
  const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const [ma, mb] = [mean(a), mean(b)];
  let num = 0;
  let da = 0;
  let db = 0;
  a.forEach((x, i) => {
    const y = b[i] ?? 0;
    num += (x - ma) * (y - mb);
    da += (x - ma) ** 2;
    db += (y - mb) ** 2;
  });
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** `entries` counted per minute between `from` and `to` (ms). */
export function perMinute(entries: readonly CloudLogEntry[], from: number, to: number) {
  const buckets = Array.from({ length: Math.max(1, Math.ceil((to - from) / 60_000)) }, () => 0);
  for (const entry of entries) {
    const at = Math.floor((Date.parse(entry.time) - from) / 60_000);
    if (at >= 0 && at < buckets.length) buckets[at] = (buckets[at] ?? 0) + 1;
  }
  return buckets;
}

/** Every link between two groups `a` and `b`; `all` is every group, to tell a broad value apart. */
function linksBetween(
  a: IncidentGroup,
  b: IncidentGroup,
  all: readonly IncidentGroup[],
  range: { from: number; to: number },
) {
  const links: IncidentLink[] = [];
  const add = (reason: LinkReason, detail: string, strength: number) =>
    links.push({
      from: a.key,
      to: b.key,
      reason,
      detail,
      strength: Math.round(strength * 100) / 100,
    });
  const ids = (pick: (e: CloudLogEntry) => string[]) => {
    const inB = new Set(b.entries.flatMap(pick));
    return [...new Set(a.entries.flatMap(pick))].filter((id) => inB.has(id));
  };
  const traces = ids((e) => (traceOf(e) ? [traceOf(e) as string] : []));
  if (traces.length)
    add(
      'trace',
      `trace ${traces[0]}${traces.length > 1 ? ` and ${traces.length - 1} more` : ''}`,
      0.9,
    );
  const requests = ids((e) => requestIds(e.message));
  if (requests.length)
    add(
      'request',
      `request ${requests[0]}${requests.length > 1 ? ` and ${requests.length - 1} more` : ''}`,
      0.85,
    );
  // A context value both groups mostly carry, that most other groups do not.
  const fieldPairs = (e: CloudLogEntry) =>
    Object.entries(e.fields)
      .filter(([key]) => !BROAD.has(key.toLowerCase()))
      .map(([key, value]) => `${key}=${value}`);
  const [sa, sb] = [shares(a.entries, fieldPairs), shares(b.entries, fieldPairs)];
  // Broad: most of the other groups carry it too, so it tells nothing about these two.
  const others = all.filter((g) => g.key !== a.key && g.key !== b.key);
  const carriers = (pair: string) =>
    others.filter((g) => (shares(g.entries, fieldPairs).get(pair) ?? 0) >= 0.5).length;
  for (const [pair, share] of sa) {
    const other = sb.get(pair) ?? 0;
    if (share < 0.5 || other < 0.5) continue;
    const broad = others.length > 0 && carriers(pair) / others.length > 0.5;
    if (broad) continue;
    const [key] = pair.split('=');
    add(
      key?.toLowerCase() === 'revision' ? 'revision' : 'context',
      pair,
      key?.toLowerCase() === 'revision' ? 0.45 : 0.5 + 0.2 * Math.min(share, other),
    );
  }
  const [ca, cb] = [
    perMinute(a.entries, range.from, range.to),
    perMinute(b.entries, range.from, range.to),
  ];
  const busy = (xs: number[]) => xs.filter(Boolean).length >= COUNT_BUCKETS;
  const r = busy(ca) && busy(cb) ? correlation(ca, cb) : 0;
  if (r >= CORRELATION) add('counts', `counts rise together (r ${r.toFixed(2)})`, 0.7 * r);
  return links;
}

/** The first time any of `group`'s entries was seen. */
const firstOf = (group: IncidentGroup) =>
  group.entries.reduce(
    (min, e) => (!min || Date.parse(e.time) < Date.parse(min) ? e.time : min),
    '',
  );

/**
 * The incidents among `groups`: groups whose links (linksBetween) reach LINK_THRESHOLD join one,
 * its origin the earliest group that is no gateway's symptom (a 502 is the gateway reporting its
 * upstream), else the earliest. A group with no link stays single and is in none.
 */
export function incidentsOf(
  groups: readonly IncidentGroup[],
  range: { from: number; to: number },
): Incident[] {
  const parent = new Map(groups.map((g) => [g.key, g.key]));
  const root = (key: string): string => {
    const up = parent.get(key) ?? key;
    return up === key ? key : root(up);
  };
  const links: IncidentLink[] = [];
  groups.forEach((a, i) => {
    for (const b of groups.slice(i + 1)) {
      const found = linksBetween(a, b, groups, range);
      links.push(...found);
      if (found.some((l) => l.strength >= LINK_THRESHOLD)) parent.set(root(a.key), root(b.key));
    }
  });
  const byRoot = new Map<string, IncidentGroup[]>();
  for (const g of groups) byRoot.set(root(g.key), [...(byRoot.get(root(g.key)) ?? []), g]);
  return [...byRoot.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const keys = new Set(members.map((m) => m.key));
      const byTime = [...members].sort((x, y) => Date.parse(firstOf(x)) - Date.parse(firstOf(y)));
      const origin =
        byTime.find((m) => !GATEWAY.test(splitMessage(m.message).head)) ??
        (byTime[0] as IncidentGroup);
      return {
        id: `incident:${origin.key}`,
        groups: byTime.map((m) => m.key),
        origin: origin.key,
        started: firstOf(byTime[0] as IncidentGroup),
        services: [...new Set(members.flatMap((m) => m.services))],
        links: links.filter(
          (l) => keys.has(l.from) && keys.has(l.to) && l.strength >= LINK_THRESHOLD,
        ),
      };
    });
}

/** A group's own story from its entries: counts over the range, its top message variants, its facets. */
export function groupStats(
  entries: readonly CloudLogEntry[],
  range: { from: number; to: number },
  buckets = 24,
) {
  const width = (range.to - range.from) / buckets;
  const spark = Array.from({ length: buckets }, () => 0);
  for (const entry of entries) {
    const at = Math.floor((Date.parse(entry.time) - range.from) / width);
    if (at >= 0 && at < buckets) spark[at] = (spark[at] ?? 0) + 1;
  }
  const variants = new Map<string, { message: string; count: number }>();
  for (const entry of entries) {
    const head = splitMessage(entry.message).head;
    const key = normalizedMessage(head);
    const known = variants.get(key);
    if (known) known.count++;
    else variants.set(key, { message: head, count: 1 });
  }
  return {
    spark,
    variants: [...variants.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    facets: facetsOf(entries, 6, 5),
  };
}
