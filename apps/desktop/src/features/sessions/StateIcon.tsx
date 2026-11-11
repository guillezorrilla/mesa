import type { SessionState } from '@mesa/core';
import { cn } from '@/lib/utils';
import { stateTone } from './stateTone';

/** A session's state as one small icon (stateTone), named for screen readers. */
export function StateIcon(props: { state: SessionState; className?: string }) {
  const { icon: Icon, mark, label } = stateTone(props.state);
  return (
    <Icon
      role="img"
      aria-label={label}
      data-state={props.state}
      className={cn('size-3 shrink-0', mark, props.className)}
    />
  );
}
