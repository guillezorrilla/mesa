import type { CallResult } from '@mesa/core/phone';

/** What became of Send to the session, in one sentence. */
export function sendText(sent: CallResult<'prSend'>) {
  if (sent.status === 'delivered') return 'Sent to the session: it has the failed check now.';
  if (sent.status === 'waiting')
    return `The session is busy; it gets the failed check when it is idle${sent.reason ? ` (${sent.reason})` : ''}.`;
  if (sent.status === 'nothing') return `Nothing sent: ${sent.reason ?? 'nothing new waits'}.`;
  return `Not sent (${sent.status})${sent.reason ? `: ${sent.reason}` : ''}.`;
}
