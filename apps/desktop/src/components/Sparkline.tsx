import { cn } from '@/lib/utils';

/** A row of tiny bars, one per count, scaled to the largest: how a count moved over a range. */
export function Sparkline(props: {
  counts: readonly number[];
  className?: string;
  label?: string;
}) {
  const top = Math.max(1, ...props.counts);
  return (
    <span
      role="img"
      aria-label={props.label ?? `counts ${props.counts.join(', ')}`}
      className={cn('inline-flex h-4 shrink-0 items-end gap-px', props.className)}
    >
      {props.counts.map((count, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: one bar per bucket, in order
          key={i}
          className={cn('w-[3px] rounded-[1px]', count ? 'bg-state-failed/70' : 'bg-border')}
          style={{ height: `${count ? Math.max(15, (count / top) * 100) : 12}%` }}
        />
      ))}
    </span>
  );
}
