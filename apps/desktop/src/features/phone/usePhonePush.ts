import { useRef } from 'react';
import { useCall } from '@/lib/useCommand';
import { useSessionEvents } from '@/lib/useSessionEvents';

/**
 * Asks core to push new session notices to the paired phone whenever a hook lands and on the
 * fallback poll (#1016); core decides whether the person is away and pushes each notice once.
 * One run at a time, and a failure says nothing here: the notice stays in the Inbox.
 */
export function usePhonePush() {
  const call = useCall();
  const busy = useRef(false);
  useSessionEvents(() => {
    if (busy.current) return;
    busy.current = true;
    void call('phone.push').finally(() => {
      busy.current = false;
    });
  });
}
