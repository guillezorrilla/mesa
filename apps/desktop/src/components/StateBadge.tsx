import type { SessionState } from '@mesa/core';
import { cn } from '@/lib/utils';

/** One colour per Session state (the theme's `--state-*` tokens); waits are the warm one. */
const TONE: Record<SessionState, string> = {
  working: 'bg-state-working/15 text-state-working ring-state-working/30',
  'waiting-permission': 'bg-state-waiting/25 text-foreground ring-state-waiting font-semibold',
  'waiting-question': 'bg-state-waiting/25 text-foreground ring-state-waiting font-semibold',
  idle: 'bg-state-idle/15 text-state-idle ring-state-idle/30',
  done: 'bg-state-done/15 text-muted-foreground ring-state-done/30',
  failed: 'bg-state-failed/15 text-state-failed ring-state-failed/40',
};

/** A session's state and Faro's confidence in it, coloured by state; `title` says who decided. */
export function StateBadge(props: {
  state: SessionState;
  confidence: number;
  title?: string;
  className?: string;
}) {
  return (
    <span
      data-testid="session-state"
      data-state={props.state}
      title={props.title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset',
        TONE[props.state],
        props.className,
      )}
    >
      {props.state} {Math.round(props.confidence * 100)}%
    </span>
  );
}
