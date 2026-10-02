import { CalendarClock } from 'lucide-react';

/** The rule that created a session, retained with its record. */
export function AutomationBanner({ rule }: { rule: string }) {
  return (
    <span
      className="flex items-center gap-1 text-xs text-muted-foreground"
      data-testid="automation-banner"
    >
      <CalendarClock aria-hidden className="size-3" />
      Automation: {rule}
    </span>
  );
}
