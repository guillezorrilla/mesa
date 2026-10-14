import { cn } from '@/lib/utils';

/** Added and removed line counts, as +12 -3. */
export function Stat(props: { added: number; removed: number; className?: string }) {
  return (
    <span className={cn('shrink-0 font-mono text-xs tabular-nums', props.className)}>
      <span className="text-state-idle">+{props.added}</span>{' '}
      <span className="text-state-failed">-{props.removed}</span>
    </span>
  );
}
