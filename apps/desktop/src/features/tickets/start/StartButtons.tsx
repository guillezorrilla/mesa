import type { TicketStart } from '@mesa/core/browser';
import { Button } from '@/components/ui/button';
import { startList } from './starts';

/**
 * The Ticket start buttons, weakest first. `onPoint` hears which one is pointed at or focused, for
 * a caption saying what it does; without it, each button's tooltip does.
 */
export function StartButtons(props: {
  onStart: (kind: TicketStart) => void;
  onPoint?: (kind: TicketStart) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {startList().map(({ kind, label, hint, icon: Icon, variant }) => (
        <Button
          key={kind}
          type="button"
          variant={variant}
          title={props.onPoint ? undefined : hint}
          data-testid={`start-${kind}`}
          onClick={() => props.onStart(kind)}
          onPointerEnter={() => props.onPoint?.(kind)}
          onFocus={() => props.onPoint?.(kind)}
        >
          <Icon aria-hidden /> {label}
        </Button>
      ))}
    </div>
  );
}
