import type { TicketStart } from '@mesa/core';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { branchOf, type StartOptions } from '../useStartTicket';
import { StartButtons } from './StartButtons';

/** Where and how every start runs, in a few words: what each button does with one click. */
const summary = (key: string, options: StartOptions) =>
  [
    options.start === 'worktree' ? `New worktree on ${branchOf(key)}` : 'Main checkout',
    options.assign && 'assign to me',
    options.notes && 'notes first',
    options.prompt && `your rules: ${options.prompt}`,
  ]
    .filter(Boolean)
    .join(' · ');

/** The ticket's footer: each start button starts it now as `options` say; Options changes them. */
export function StartBar(props: {
  ticketKey: string;
  options: StartOptions;
  onStart: (as: TicketStart) => void;
  onCustomize: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-card px-6 py-3.5">
      <span data-testid="start-summary" className="min-w-40 flex-1 text-xs text-muted-foreground">
        {summary(props.ticketKey, props.options)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        title="Options: where it runs, your rules, assigning, notes"
        aria-label="Options"
        onClick={props.onCustomize}
        data-testid="start-options"
      >
        <SlidersHorizontal aria-hidden />
      </Button>
      <StartButtons onStart={props.onStart} />
    </div>
  );
}
