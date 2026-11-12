import { useState } from 'react';
import type { LineSelection } from '@/lib/lineSelection';
import { useMacRead } from '../mac/useMacRead';
import { type ReplyLine, tapReplyLine } from './replyLines';

/** A session read once for one of its replies, and the lines of it tapped to quote. */
export function useQuote(id: string) {
  const { answer } = useMacRead({ method: 'session', id });
  const [selection, setSelection] = useState<LineSelection>();
  const tap = (lines: readonly ReplyLine[], at: number) =>
    setSelection((last) => tapReplyLine(lines, last, at));
  return { answer, selection, tap };
}
