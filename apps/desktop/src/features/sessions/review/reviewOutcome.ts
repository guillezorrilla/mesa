import type { ReviewDelivery } from '@mesa/core';
import type { Message } from '@/components/Toast';

/** A known refusal can be retried; an uncertain send must be inspected first. */
export function reviewOutcome(
  result: ReviewDelivery,
  label: string,
): { detail: string; message: Message } {
  if (result.status === 'failed')
    return {
      detail: `${result.reason ?? `${label} was not sent`}. Retry after resolving it.`,
      message: { text: `${label} was not sent`, tone: 'alert' },
    };
  return {
    detail: `${result.reason ?? 'Delivery is uncertain'}. Inspect the session before another send.`,
    message: { text: `${label} delivery is uncertain`, tone: 'alert' },
  };
}
