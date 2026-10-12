import type { Ticket } from '@mesa/core';
import { StatusIcon } from './StatusIcon';

/** A ticket's status in its panel (Jira's, Linear's): the shared status icon, then its name. */
export function CategoryStatus({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <StatusIcon category={ticket.category} />
      {ticket.status}
    </>
  );
}
