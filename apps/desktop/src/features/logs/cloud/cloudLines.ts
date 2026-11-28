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

/** The bar widths the Explorer's histogram picks from, smallest first. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);

/**
 * The entries read over the span they cover, not the whole range: about `bars` bars of a round
 * width (`stepMs`), oldest first, each with its errors; `from` and `to` bound the bars.
 */
export function spanBuckets(entries: readonly CloudLogEntry[], bars = 40) {
  const times = entries.map((e) => Date.parse(e.time)).filter((t) => !Number.isNaN(t));
  if (!times.length) return { buckets: [] as CloudBucket[], stepMs: 0, from: 0, to: 0 };
  const oldest = Math.min(...times);
  const newest = Math.max(...times);
  const stepMs = STEPS.find((step) => step * bars >= newest - oldest) ?? (STEPS.at(-1) as number);
  const from = Math.floor(oldest / stepMs) * stepMs;
  const count = Math.floor((newest - from) / stepMs) + 1;
  const buckets = Array.from({ length: count }, (_, i) => ({
    start: from + i * stepMs,
    count: 0,
    errors: 0,
  }));
  for (const entry of entries) {
    const bucket = buckets[Math.floor((Date.parse(entry.time) - from) / stepMs)];
    if (!bucket) continue;
    bucket.count++;
    if (cloudLevel(entry.severity) === 'error') bucket.errors++;
  }
  return { buckets, stepMs, from, to: from + count * stepMs };
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

/** What the toolbar button says: the one project's id, else how many. */
export const projectsLabel = (projects: readonly string[]) =>
  projects.length === 1 ? (projects[0] as string) : `${projects.length} projects`;
