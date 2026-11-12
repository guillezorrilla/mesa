import type { NoteDelivery } from '@mesa/core/phone';

/** What became of a note or a quote sent to the agent, in words. */
export function deliveryText(delivery: NoteDelivery) {
  if (delivery.status === 'delivered') return 'Sent to the agent.';
  const why = delivery.reason ? `: ${delivery.reason}` : '.';
  return delivery.status === 'uncertain'
    ? `It may not have reached the agent${why}`
    : `Not sent${why}`;
}
