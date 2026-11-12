import type { SendResult } from '@mesa/core/phone';

/** What the composer says after a send: why the guardrail stopped it, or that it waits; none once sent. */
export function sendNoteText({ status, reason }: SendResult): string | undefined {
  const why = reason ?? 'no reason given';
  if (status === 'ask') return `The guardrail asks first: ${why}.`;
  if (status === 'blocked') return `The guardrail blocked it: ${why}. Nothing was sent.`;
  if (status === 'queued') return 'Queued: it is sent when this turn ends.';
  return undefined;
}
