import type { SessionState } from '@mesa/core';
import {
  Check,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock3,
  LoaderCircle,
  type LucideIcon,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Each state's icon and colour: a spinner working, a check done, a question waiting on a person. */
const ICONS: Record<SessionState, { icon: LucideIcon; tone: string; label: string }> = {
  working: {
    icon: LoaderCircle,
    tone: 'text-state-working motion-safe:animate-spin',
    label: 'Working',
  },
  'waiting-permission': { icon: CircleHelp, tone: 'text-state-waiting', label: 'Waiting on you' },
  'waiting-question': { icon: CircleHelp, tone: 'text-state-waiting', label: 'Waiting on you' },
  idle: { icon: Clock3, tone: 'text-state-idle', label: 'Idle' },
  done: { icon: Check, tone: 'text-state-done', label: 'Done' },
  failed: { icon: CircleX, tone: 'text-state-failed', label: 'Failed' },
  queued: { icon: CircleDashed, tone: 'text-muted-foreground', label: 'Queued' },
  stopped: { icon: Square, tone: 'text-muted-foreground', label: 'Stopped' },
};

/** A session's state as one small icon, named for screen readers. */
export function StateIcon(props: { state: SessionState; className?: string }) {
  const { icon: Icon, tone, label } = ICONS[props.state];
  return (
    <Icon
      role="img"
      aria-label={label}
      data-state={props.state}
      className={cn('size-3 shrink-0', tone, props.className)}
    />
  );
}
