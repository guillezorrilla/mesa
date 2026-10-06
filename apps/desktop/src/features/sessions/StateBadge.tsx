import type { SessionState } from '@mesa/core';
import { cn } from '@/lib/utils';
import { stateTone } from './stateTone';

/** A session's state, coloured by state; `title` says who decided. */
export function StateBadge(props: {
  state: SessionState;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const tone = stateTone(props.state);
  return (
    <span
      data-testid="session-state"
      data-state={props.state}
      title={props.title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset',
        tone.badge,
        props.compact && 'bg-transparent px-0 py-0 ring-0',
        props.compact && tone.compact,
        props.className,
      )}
    >
      {props.compact ? `◉ ${props.state}` : props.state}
    </span>
  );
}
