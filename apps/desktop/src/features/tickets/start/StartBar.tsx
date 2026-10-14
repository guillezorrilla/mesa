import type { TicketStart } from '@mesa/core/browser';
import { SlidersHorizontal } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Checkbox } from '@/components/ui/checkbox';
import { StartButtons } from './StartButtons';
import { assignLabel, describeOptions, type StartOptions, type StartTicket } from './startOptions';

/**
 * The ticket's footer: Assign to me as a check always in view (for a ticket not already mine),
 * then each start button, which starts it now as `options` say; Options changes the rest.
 */
export function StartBar(props: {
  ticket: StartTicket;
  options: StartOptions;
  onChange: (change: Partial<StartOptions>) => void;
  onStart: (kind: TicketStart) => void;
  onCustomize: () => void;
}) {
  const { ticket } = props;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-card px-6 py-3.5">
      <div className="grid min-w-40 flex-1 gap-1.5">
        {!ticket.mine && (
          <label htmlFor="bar-assign" className="flex w-fit items-center gap-2 text-sm font-medium">
            <Checkbox
              id="bar-assign"
              aria-label={assignLabel(ticket)}
              checked={props.options.assign}
              onCheckedChange={(checked) => props.onChange({ assign: checked === true })}
            />
            {assignLabel(ticket)}
          </label>
        )}
        <span data-testid="start-summary" className="text-xs text-muted-foreground">
          {describeOptions(ticket.label, props.options)}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <IconButton
          label="Options"
          icon={SlidersHorizontal}
          size="icon"
          onClick={props.onCustomize}
          data-testid="start-options"
        />
        <StartButtons onStart={props.onStart} />
      </div>
    </div>
  );
}
