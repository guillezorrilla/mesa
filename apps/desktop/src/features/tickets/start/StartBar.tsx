import type { TicketStart } from '@mesa/core/browser';
import { SlidersHorizontal } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { StartButtons } from './StartButtons';
import { describeOptions, type StartOptions } from './startOptions';

/** The ticket's footer: each start button starts it now as `options` say; Options changes them. */
export function StartBar(props: {
  ticketKey: string;
  options: StartOptions;
  onStart: (kind: TicketStart) => void;
  onCustomize: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-card px-6 py-3.5">
      <span data-testid="start-summary" className="min-w-40 flex-1 text-xs text-muted-foreground">
        {describeOptions(props.ticketKey, props.options)}
      </span>
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
