import type { TicketStart } from '@mesa/core';
import { type LucideIcon, MessageSquare, ScanSearch, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Each Ticket start's button, least to most committed: its look says how much it sets going. */
export const STARTS: {
  as: TicketStart;
  label: string;
  hint: string;
  icon: LucideIcon;
  variant: 'ghost' | 'outline' | 'default';
}[] = [
  {
    as: 'session',
    label: 'Start session',
    hint: 'Loads the ticket as context, then waits for your prompt',
    icon: MessageSquare,
    variant: 'ghost',
  },
  {
    as: 'investigate',
    label: 'Investigate',
    hint: 'Finds the root cause or the answer with proof, no guessing, and leaves the code as it was; then offers a fix session',
    icon: ScanSearch,
    variant: 'outline',
  },
  {
    as: 'goal',
    label: 'Start goal',
    hint: '/goal: finishes the ticket, proven by tests and checks, then commits on a branch and pushes it',
    icon: Target,
    variant: 'default',
  },
];

/** The three ways to start a session on a ticket, Start goal last and strongest. */
export function StartButtons(props: { onStart: (as: TicketStart) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STARTS.map(({ as, label, hint, icon: Icon, variant }) => (
        <Button
          key={as}
          type="button"
          variant={variant}
          title={hint}
          data-testid={`start-${as}`}
          className={variant === 'ghost' ? 'text-muted-foreground' : undefined}
          onClick={() => props.onStart(as)}
        >
          <Icon aria-hidden /> {label}
        </Button>
      ))}
    </div>
  );
}
