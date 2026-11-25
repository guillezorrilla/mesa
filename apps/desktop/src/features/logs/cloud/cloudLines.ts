import type { CloudLogEntry } from '@mesa/core';
import { cloudLevel } from '@mesa/core/browser';

// Cloud Logs entries as the Logs tab shows them: the chart's buckets, citations, service refs.

/** The time ranges the tab offers, as `--since` takes them: each one's label and length. */
export const CLOUD_RANGES = {
  '1h': ['Last 1 h', 3_600_000],
  '6h': ['Last 6 h', 6 * 3_600_000],
  '24h': ['Last 24 h', 24 * 3_600_000],
} as const;
export type CloudRange = keyof typeof CLOUD_RANGES;

/** One chart bar's width. */
export const BUCKET_MS = 5 * 60_000;

export type CloudBucket = { start: number; count: number; errors: number };

/**
 * The entries per 5 minutes over the `rangeMs` before `now`, oldest first, each with how many
 * are errors; an entry outside the range or with no time is left out.
 */
export function cloudBuckets(
  entries: readonly CloudLogEntry[],
  rangeMs: number,
  now: number,
): CloudBucket[] {
  const end = Math.ceil(now / BUCKET_MS) * BUCKET_MS;
  const start = end - Math.ceil(rangeMs / BUCKET_MS) * BUCKET_MS;
  const buckets = Array.from({ length: (end - start) / BUCKET_MS }, (_, i) => ({
    start: start + i * BUCKET_MS,
    count: 0,
    errors: 0,
  }));
  for (const entry of entries) {
    const bucket = buckets[Math.floor((Date.parse(entry.time) - start) / BUCKET_MS)];
    if (!bucket) continue;
    bucket.count++;
    if (cloudLevel(entry.severity) === 'error') bucket.errors++;
  }
  return buckets;
}

/** An answer split into its text and the cited entry ids in `[id]` it holds. */
export function citedParts(
  answer: string,
  cited: ReadonlySet<string>,
): ({ id: string } | { text: string })[] {
  return answer
    .split(/(\[[^\]\s]+\])/)
    .filter(Boolean)
    .map((part) => {
      const id = part.slice(1, -1);
      return part.startsWith('[') && cited.has(id) ? { id } : { text: part };
    });
}

/** An entry's service as the picker and `--service` name it: `<project>/<name>`. */
export const serviceRef = (entry: { project: string; service: string | null }) =>
  `${entry.project}/${entry.service ?? '-'}`;

/** A trace field's id, the part after `/traces/`, which a filter matches in every project. */
export const traceId = (trace: string) => trace.split('/').at(-1) ?? trace;

/** What the toolbar button says: the one project's id, else how many. */
export const projectsLabel = (projects: readonly string[]) =>
  projects.length === 1 ? (projects[0] as string) : `${projects.length} projects`;
