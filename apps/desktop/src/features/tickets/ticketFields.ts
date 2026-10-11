import type { ProviderId, Ticket } from '@mesa/core';
import type { TicketDetail } from '@/lib/client/tickets';

/**
 * What a tracker's panel fields get: the listed ticket, its panel read once it arrives (its own
 * provider's), and its views' sprints.
 */
export type TicketFieldsProps<K extends ProviderId = ProviderId> = {
  ticket: Ticket;
  detail: Extract<TicketDetail, { provider: K }> | undefined;
  /** The sprints of the views listing it. */
  sprints: string[];
};
