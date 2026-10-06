import type { SessionState } from '@mesa/core';

/** How one Session state is coloured on the state badge and the sidebar session card. */
type Tone = {
  /** The state badge: fill, text and ring. */
  badge: string;
  /** The compact badge's text, where it differs from the badge's. */
  compact?: string;
  /** The sidebar card's dot. */
  dot: string;
  /** The sidebar card's state line. */
  line: string;
};

const WAITING: Tone = {
  badge: 'bg-state-waiting/25 text-foreground ring-state-waiting font-semibold',
  compact: 'text-state-waiting',
  dot: 'border-state-waiting',
  line: 'text-state-waiting',
};

/**
 * One colour per Session state (the theme's `--state-*` tokens); waits are the warm one, and the
 * states Mesa holds (queued, stopped) are uncoloured.
 */
const TONES: Record<SessionState, Tone> = {
  working: {
    badge: 'bg-state-working/15 text-state-working ring-state-working/30',
    dot: 'border-state-working',
    line: 'text-muted-foreground',
  },
  'waiting-permission': WAITING,
  'waiting-question': WAITING,
  idle: {
    badge: 'bg-state-idle/15 text-state-idle ring-state-idle/30',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
  },
  done: {
    badge: 'bg-state-done/15 text-muted-foreground ring-state-done/30',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
  },
  failed: {
    badge: 'bg-state-failed/15 text-state-failed ring-state-failed/40',
    dot: 'border-state-failed',
    line: 'text-state-failed',
  },
  // Mesa's own: no agent has run yet, or ever will.
  queued: {
    badge: 'text-muted-foreground ring-0 border border-dashed border-muted-foreground/60',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
  },
  stopped: {
    badge: 'text-muted-foreground ring-border line-through',
    dot: 'border-state-idle',
    line: 'text-muted-foreground',
  },
};

/** The classes that colour `state` on the state badge and the sidebar session card. */
export const stateTone = (state: SessionState): Tone => TONES[state];
