import type { CloudLogEntry } from '@mesa/core';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BUCKET_MS, type CloudBucket, spanBuckets } from '../cloudLines';

/** A time on the chart's axis: with seconds when its bars are under a minute. */
const clock = (ms: number, seconds: boolean) =>
  new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });

/** A bar width in words: `2 s`, `5 min`, `1 h`. */
const width = (ms: number) =>
  ms < 60_000 ? `${ms / 1000} s` : ms < 3_600_000 ? `${ms / 60_000} min` : `${ms / 3_600_000} h`;

/**
 * The Explorer's bar chart, errors in red at the foot: a log-based metric's counts from Cloud
 * Monitoring per 5 minutes over the range when a view maps to one, else the entries read over the
 * span they cover (spanBuckets), labelled with that span, and Load older to reach further back.
 */
export function CloudLogsChart(props: {
  entries: readonly CloudLogEntry[];
  counts?: readonly { start: string; count: number }[];
  /** Reads the page before the oldest entry, when there is one. */
  onOlder?: () => void;
  olderBusy?: boolean;
}) {
  const span = spanBuckets(props.entries);
  const metered = props.counts?.map((c) => ({
    start: Date.parse(c.start),
    count: c.count,
    errors: 0,
  }));
  const buckets: CloudBucket[] = metered ?? span.buckets;
  const step = metered ? BUCKET_MS : span.stepMs;
  const seconds = step < 60_000;
  const most = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const first = buckets[0]?.start ?? 0;
  const last = (buckets.at(-1)?.start ?? 0) + step;
  const read = props.entries.length;
  return (
    <figure aria-label="Entries over time" className="rounded-lg border bg-card px-3 pt-3 pb-2">
      <div className="flex h-20 items-end gap-px">
        {buckets.map((bucket) => (
          <div
            key={bucket.start}
            title={`${clock(bucket.start, seconds)}: ${bucket.count} entries${metered ? '' : `, ${bucket.errors} errors`}`}
            className="flex h-full min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t-[2px] hover:opacity-80"
          >
            <div
              className={metered ? 'bg-state-working/60' : 'bg-muted-foreground/35'}
              style={{ height: `${((bucket.count - bucket.errors) / most) * 100}%` }}
            />
            <div
              className="bg-state-failed/75"
              style={{ height: `${(bucket.errors / most) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground tabular-nums">
        <span className="shrink-0">{buckets.length ? clock(first, seconds) : ''}</span>
        <span className="flex items-center gap-2 text-center">
          {metered
            ? 'per 5 min over the range, counted by the log-based metric'
            : read
              ? `${read} ${read === 1 ? 'entry' : 'entries'} read, ${clock(first, seconds)} to ${clock(last, seconds)}, per ${width(step)}`
              : 'No entries read'}
          {!metered && props.onOlder && (
            <Button size="xs" variant="ghost" disabled={props.olderBusy} onClick={props.onOlder}>
              <History aria-hidden /> {props.olderBusy ? 'Reading older' : 'Load older'}
            </Button>
          )}
        </span>
        <span className="shrink-0">{buckets.length ? clock(last, seconds) : ''}</span>
      </figcaption>
    </figure>
  );
}
