import type { CallResult, PhoneCall } from '@mesa/core/phone';
import { useState, useTransition } from 'react';
import { keepLast, type MacRead, tryCall } from './tryCall';
import { useMac } from './useMac';

/**
 * One call's answer as a promise to `use()`, and `again` to ask anew (`refreshing` meanwhile):
 * the last answer stays shown when a later read fails.
 */
export function useMacRead<M extends PhoneCall['method']>(
  call: Extract<PhoneCall, { method: M }>,
  /** For a call that can take longer than most to answer, such as a large diff. */
  timeoutMs?: number,
) {
  const link = useMac();
  const read = async (last?: Promise<MacRead<CallResult<M>>>) =>
    keepLast(await tryCall(link, () => link.read(call, timeoutMs)), last);
  const [answer, setAnswer] = useState(() => read());
  const [refreshing, startTransition] = useTransition();
  // The promise is made here, not in an updater, which React may run again while it suspends.
  const again = () => {
    const next = read(answer);
    startTransition(() => setAnswer(next));
  };
  return { answer, again, refreshing };
}
