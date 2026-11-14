import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Over a terminal whose window a phone holds at its size, as orca's phone-driving chip: Take back
 * sizes the window to this view again.
 */
export function PhoneHoldChip({ onTakeBack }: { onTakeBack: () => void }) {
  return (
    <div
      role="status"
      className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-2.5 text-xs font-medium text-card-foreground shadow-xs"
    >
      <Smartphone aria-hidden className="size-3" />
      Your phone is in control
      <Button size="xs" className="rounded-full" onClick={onTakeBack}>
        Take back
      </Button>
    </div>
  );
}
