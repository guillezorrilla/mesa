import type { CallResult } from '@mesa/core/phone';

/** What became of Send to the session, in one sentence. */
export function sendText(sent: CallResult<'prSend'>) {
  if (sent.status === 'delivered') return 'Sent to the session: it has the failed check now.';
  if (sent.status === 'waiting')
    return `The session is busy, so nothing was sent${sent.reason ? ` (${sent.reason})` : ''}. Mesa sends it on its next pass of PR events once the session is idle, or send it again then.`;
  if (sent.status === 'nothing') return `Nothing sent: ${sent.reason ?? 'nothing new waits'}.`;
  return `Not sent (${sent.status})${sent.reason ? `: ${sent.reason}` : ''}.`;
}
