import type { Ticket } from '@mesa/core';

/** A hex color ClickUp gives, as CSS; undefined for anything else. */
export const clickupHex = (color: string | undefined) =>
  color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined;

/** A ClickUp task's status as ClickUp draws it: an uppercase pill in the status's own color. */
export function ClickupStatus({ ticket }: { ticket: Ticket }) {
  return (
    <span
      style={{ backgroundColor: clickupHex(ticket.color) }}
      className="rounded bg-muted-foreground px-1.5 py-px text-[11px] font-semibold tracking-wide text-white uppercase"
    >
      {ticket.status}
    </span>
  );
}
