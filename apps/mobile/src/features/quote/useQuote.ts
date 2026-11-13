import { SESSION_REPLIES } from '@mesa/core/phone';
import { useLineSelection } from '@/lib/useLineSelection';
import { SLOW_MS } from '../mac/slowCall';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useMacRead } from '../mac/useMacRead';
import { type ReplyLine, tapReplyLine } from './replyLines';

/**
 * The quote screen: the session read once for the reply, the lines of it tapped (kept inside one
 * segment), and a comment on the passage sent to its agent.
 */
export function useQuote(id: string, reply: string) {
  const link = useMac();
  // As many replies as the session screen shows at most, so any reply quoted from it is here.
  const { answer } = useMacRead({ method: 'session', id, replies: SESSION_REPLIES.most });
  const { selection, tap } = useLineSelection();
  return {
    answer,
    selection,
    tap: (lines: readonly ReplyLine[], at: number) =>
      tap(at, (last) => tapReplyLine(lines, last, at)),
    sendQuote: (passage: string, comment: string) =>
      tryCall(link, () =>
        link.call({ method: 'quote', id, revision: reply, passage, comment }, SLOW_MS),
      ),
  };
}
