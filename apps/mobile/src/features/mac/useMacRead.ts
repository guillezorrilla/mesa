import type { CallResult, PhoneCall } from '@mesa/core/phone';
import { startTransition, useState, useTransition } from 'react';
import { keepLast, type MacRead, tryCall } from './tryCall';
import { useMac } from './useMac';

/**
 * One call's answer as a promise to `use()`; `again` asks anew quietly (a focus, a timer, after a
 * change) and `pull` for a person's pull to refresh, the only read `refreshing` shows: a spinner
 * for a read nobody pulled holds a list, and its large title, below an empty band while a slow
 * Mac answers. The last answer stays shown when a later read fails.
 */
export function useMacRead<M extends PhoneCall['method']>(
  call: Extract<PhoneCall, { method: M }>,
  /** For a call that can take longer than most to answer, such as a large diff. */
  timeoutMs?: number,
) {
  const link = useMac();
  const read = async (last?: Promise<MacRead<CallResult<M>>>) =>
    keepLast(await tryCall(link, () => link.call(call, timeoutMs)), last);
  const [answer, setAnswer] = useState(() => read());
  const [refreshing, startPull] = useTransition();
  // The promise is made here, not in an updater, which React may run again while it suspends.
  const ask = (start: typeof startTransition) => {
    const next = read(answer);
    start(() => setAnswer(next));
  };
  return { answer, again: () => ask(startTransition), pull: () => ask(startPull), refreshing };
}
