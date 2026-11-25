import type { CloudLogEntry } from '@mesa/core';
import { BUCKET_MS, cloudBuckets } from '../cloudLines';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The Logs tab's bar chart per 5 minutes over the time range: a log-based metric's counts from
 * Cloud Monitoring when a view maps to one, else the page of entries read, errors in red at the
 * foot, with a note saying which.
 */
export function CloudLogsChart(props: {
  entries: readonly CloudLogEntry[];
  rangeMs: number;
  counts?: readonly { start: string; count: number }[];
}) {
  const buckets = props.counts
    ? props.counts.map((c) => ({ start: Date.parse(c.start), count: c.count, errors: 0 }))
    : cloudBuckets(props.entries, props.rangeMs, Date.now());
  const most = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const first = buckets[0]?.start ?? 0;
  const last = (buckets.at(-1)?.start ?? 0) + BUCKET_MS;
  return (
    <figure aria-label="Entries per 5 minutes" className="rounded-lg border bg-card px-3 pt-3 pb-2">
      <div className="flex h-20 items-end gap-px">
        {buckets.map((bucket) => (
          <div
            key={bucket.start}
            title={`${clock(bucket.start)}: ${bucket.count} entries${props.counts ? '' : `, ${bucket.errors} errors`}`}
            className="flex h-full min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t-[2px] hover:opacity-80"
          >
            <div
              className={props.counts ? 'bg-state-working/60' : 'bg-muted-foreground/35'}
              style={{ height: `${((bucket.count - bucket.errors) / most) * 100}%` }}
            />
            <div
              className="bg-state-failed/75"
              style={{ height: `${(bucket.errors / most) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex items-start justify-between gap-3 text-[11px] text-muted-foreground tabular-nums">
        <span className="shrink-0">{clock(first)}</span>
        <span className="text-center">
          {props.counts
            ? 'per 5 min, counted by the log-based metric'
            : `${props.entries.length} ${props.entries.length === 1 ? 'entry' : 'entries'} read, per 5 min; the page only, not every entry in the range`}
        </span>
        <span className="shrink-0">{clock(last)}</span>
      </figcaption>
    </figure>
  );
}
