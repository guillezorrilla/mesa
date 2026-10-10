import { Play, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { branchOf, type StartOptions } from '../useStartTicket';

/** How the session will start, in a few words: what Start session does with one click. */
const summary = (key: string, options: StartOptions) =>
  [
    options.prompt ?? 'No prompt',
    options.untilDone && 'until done',
    options.assign && 'assign to me',
    options.notes && 'notes first',
    options.start === 'worktree' ? `new worktree on ${branchOf(key)}` : 'main checkout',
  ]
    .filter(Boolean)
    .join(' · ');

/** The ticket's footer: Start session starts it now as `options` say; Options changes them. */
export function StartBar(props: {
  ticketKey: string;
  options: StartOptions;
  onStart: () => void;
  onCustomize: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-card px-6 py-3.5">
      <span data-testid="start-summary" className="min-w-40 flex-1 text-xs text-muted-foreground">
        {summary(props.ticketKey, props.options)}
      </span>
      <Button variant="outline" onClick={props.onCustomize} data-testid="start-options">
        <SlidersHorizontal aria-hidden /> Options
      </Button>
      <Button onClick={props.onStart} data-testid="start-ticket">
        <Play aria-hidden /> Start session
      </Button>
    </div>
  );
}
