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

/** How one Session state is shown on the state badge, the sidebar session card and StateIcon. */
type Tone = {
  /** The state badge: fill, text and ring. */
  badge: string;
  /** The compact badge's text, where it differs from the badge's. */
  compact?: string;
  /** The sidebar card's dot. */
  dot: string;
  /** The sidebar card's state line. */
  line: string;
  /** A filled mark's colour: the Crew panel's bar. */
  fill: string;
  /** StateIcon's icon and the name a screen reader gives it. */
  icon: LucideIcon;
  label: string;
  /** The state's own colour for words and icons: StateIcon, a Crew card's status line. */
  ink: string;
};

const WAITING: Tone = {
  badge: 'bg-state-waiting/25 text-foreground ring-state-waiting font-semibold',
  compact: 'text-state-waiting',
  dot: 'border-state-waiting',
  line: 'text-state-waiting',
  fill: 'bg-state-waiting',
  icon: CircleHelp,
  ink: 'text-state-waiting',
  label: 'Waiting on you',
};

/**
 * One colour per Session state (the theme's `--state-*` tokens): working blue, waits the warm one,
 * idle teal, done green, failed red; the states Mesa holds (queued, stopped) are uncoloured.
 */
const TONES: Record<SessionState, Tone> = {
  working: {
    badge: 'bg-state-working/15 text-state-working ring-state-working/30',
    dot: 'border-state-working',
    line: 'text-muted-foreground',
    fill: 'bg-state-working',
    icon: LoaderCircle,
    ink: 'text-state-working',
    label: 'Working',
  },
  'waiting-permission': WAITING,
  'waiting-question': WAITING,
  idle: {
    badge: 'bg-state-idle/15 text-state-idle ring-state-idle/30',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
    fill: 'bg-state-idle',
    icon: Clock3,
    ink: 'text-state-idle',
    label: 'Idle',
  },
  done: {
    badge: 'bg-state-done/15 text-muted-foreground ring-state-done/30',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
    fill: 'bg-state-done',
    icon: Check,
    ink: 'text-state-done',
    label: 'Done',
  },
  failed: {
    badge: 'bg-state-failed/15 text-state-failed ring-state-failed/40',
    dot: 'border-state-failed',
    line: 'text-state-failed',
    fill: 'bg-state-failed',
    icon: CircleX,
    ink: 'text-state-failed',
    label: 'Failed',
  },
  // Mesa's own: no agent has run yet, or ever will.
  queued: {
    badge: 'text-muted-foreground ring-0 border border-dashed border-muted-foreground/60',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
    fill: 'bg-muted-foreground/40',
    icon: CircleDashed,
    ink: 'text-muted-foreground',
    label: 'Queued',
  },
  stopped: {
    badge: 'text-muted-foreground ring-border line-through',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
    fill: 'bg-muted-foreground/40',
    icon: Square,
    ink: 'text-muted-foreground',
    label: 'Stopped',
  },
};

/** How `state` shows on the state badge, the sidebar session card and StateIcon. */
export const stateTone = (state: SessionState): Tone => TONES[state];
