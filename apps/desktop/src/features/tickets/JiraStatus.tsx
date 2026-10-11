import type { Ticket } from '@mesa/core';
import { StatusIcon } from './StatusIcon';

/** A Jira ticket's status in its panel: the shared status icon, then the status's name. */
export function JiraStatus({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <StatusIcon category={ticket.category} />
      {ticket.status}
    </>
  );
}
