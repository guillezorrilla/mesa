import type { TicketStart } from '@mesa/core/browser';
import { type LucideIcon, MessageSquare, ScanSearch, Target } from 'lucide-react';

/**
 * How the app shows each Ticket start (core builds its prompt): its button, weakest first, its
 * preview tab, what it does, and its progress step. A new start is one more entry here.
 */
export const STARTS: Record<
  TicketStart,
  {
    label: string;
    tab: string;
    hint: string;
    icon: LucideIcon;
    variant: 'ghost' | 'outline' | 'default';
    step: string;
  }
> = {
  session: {
    label: 'Start session',
    tab: 'Session',
    hint: 'Loads the ticket as context, then waits for your prompt',
    icon: MessageSquare,
    variant: 'ghost',
    step: 'Start the session',
  },
  investigate: {
    label: 'Investigate',
    tab: 'Investigate',
    hint: 'Finds the root cause or the answer with proof, no guessing, and leaves the code as it was; then offers a fix session',
    icon: ScanSearch,
    variant: 'outline',
    step: 'Start the investigation',
  },
  goal: {
    label: 'Start goal',
    tab: 'Goal',
    hint: 'Finishes the ticket with /goal, proven by tests and checks, then commits on a branch and pushes it',
    icon: Target,
    variant: 'default',
    step: 'Start the goal',
  },
};

/** The start Enter runs and the sheet explains first: the strongest. */
export const DEFAULT_START: TicketStart = 'goal';

/** Each start with its look, in button order. */
export const startList = () =>
  (Object.entries(STARTS) as [TicketStart, (typeof STARTS)[TicketStart]][]).map(([kind, look]) => ({
    kind,
    ...look,
  }));
