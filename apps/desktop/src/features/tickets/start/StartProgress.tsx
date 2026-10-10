import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StartStep } from '../useStartTicket';

/** Each step of a ticket's start as it runs, ending in Open session, or Back when one failed. */
export function StartProgress(props: {
  ticketKey: string;
  steps: StartStep[];
  session?: string;
  onBack: () => void;
  onSession: (id: string) => void;
}) {
  const failed = props.steps.some((step) => step.state === 'failed');
  return (
    <div className="grid gap-4 border-t bg-card px-6 py-5" data-testid="start-progress">
      <h3 className="text-[15px] font-semibold">Starting {props.ticketKey}</h3>
      <ol className="grid gap-2.5">
        {props.steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              'flex items-center gap-2.5 text-sm',
              step.state === 'todo' && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-[18px] place-items-center rounded-full border',
                step.state === 'done' && 'border-state-idle bg-state-idle text-white',
                step.state === 'failed' && 'border-state-failed bg-state-failed text-white',
              )}
            >
              {step.state === 'done' && <Check aria-hidden className="size-3" />}
              {step.state === 'failed' && <X aria-hidden className="size-3" />}
              {step.state === 'now' && (
                <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
              )}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <div className="flex justify-end gap-2">
        {failed && (
          <Button variant="outline" onClick={props.onBack}>
            Back
          </Button>
        )}
        {props.session && (
          <Button onClick={() => props.session && props.onSession(props.session)}>
            Open session
          </Button>
        )}
      </div>
    </div>
  );
}
