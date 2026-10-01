import { cn } from '@/lib/utils';

/** A small rounded count beside a label; the attention tone the reference app uses for pending changes by default. */
export function CountPill(props: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full bg-state-waiting/20 px-1.5 text-xs text-state-waiting',
        props.className,
      )}
    >
      {props.count}
    </span>
  );
}
