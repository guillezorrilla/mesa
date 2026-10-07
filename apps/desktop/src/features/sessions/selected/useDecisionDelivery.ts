import { useState } from 'react';
import type { DataOf } from '@/lib/client';
import { useCall } from '@/lib/useCommand';

/**
 * What the selected session's Decisions row can do about delivery: install Antigravity's global
 * entry, or restart the agent so it launches with mesa-decisions mounted; `acting` while one runs.
 * The session read again goes to `onRecord`, a failure's message to `onError`.
 */
export function useDecisionDelivery(
  id: string,
  onRecord: (record: DataOf<'sessions.show'>) => void,
  onError: (message: string) => void,
) {
  const call = useCall();
  const [acting, setActing] = useState(false);
  /** Runs `step`, which resolves with a failure's message, if any, while `acting`. */
  const act = (step: () => Promise<string | undefined>) => {
    setActing(true);
    void step()
      .then((message) => message && onError(message))
      .finally(() => setActing(false));
  };
  return {
    acting,
    // Antigravity's global entry, which install writes with a Decision model.
    installHooks: () =>
      act(async () => {
        const installed = await call('hooks.install');
        if (!installed.ok) return installed.error.message;
        const shown = await call('sessions.show', { id });
        if (!shown.ok) return shown.error.message;
        onRecord(shown.data);
      }),
    // Argv cannot change in a running agent: stop it, then resume it through Mesa, which launches
    // it with mesa-decisions mounted.
    restart: () =>
      act(async () => {
        const stopped = await call('sessions.stop', { id });
        if (!stopped.ok) return stopped.error.message;
        const resumed = await call('sessions.resume', { id });
        if (!resumed.ok) return resumed.error.message;
      }),
  };
}
