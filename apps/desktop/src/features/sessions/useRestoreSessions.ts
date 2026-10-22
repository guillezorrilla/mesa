import type { EachResult, SessionRecord, SessionRow } from '@mesa/core';
import { counted, recoverable } from '@mesa/core/browser';
import { useCallback, useEffect, useRef } from 'react';
import { type Message, said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/**
 * Recoverable sessions brought back (CONTEXT.md, Interrupted session): once the app opens on a
 * set-up profile whose first sessions list any recoverable, the ones a restart ended resume on
 * their own (`mesa resume --all --interrupted`); the returned Restore all resumes every
 * recoverable one. A toast says how many came back and why any did not; the launch's says
 * nothing when none did.
 */
export function useRestoreSessions(ready: boolean, sessions: readonly SessionRow[]) {
  const run = useRun();
  const { act } = useAct();
  const launched = useRef(false);
  const restore = useCallback(
    (interrupted: boolean) =>
      act(async () => {
        const result = await run('sessions.restore', { interrupted });
        if (result?.items.length === 0 && !interrupted) return said('Nothing to restore');
        return result && restoredMessage(result);
      }),
    [act, run],
  );
  useEffect(() => {
    if (!ready || launched.current) return;
    launched.current = true;
    // ready means the first sessions arrived: with none recoverable, no restore runs.
    if (sessions.some(recoverable)) void restore(true);
  }, [ready, sessions, restore]);
  return useCallback(() => void restore(false), [restore]);
}

/** How many came back, then each failure's reason, which names its session. */
const restoredMessage = ({ items }: EachResult<SessionRecord>): Message | undefined => {
  const done = items.filter((item) => item.ok).length;
  const failed = items.flatMap((item) => (item.ok ? [] : [item.error.message]));
  const lines = [...(done > 0 ? [`Restored ${counted(done, 'session')}`] : []), ...failed];
  if (lines.length === 0) return undefined;
  return { text: lines.join('\n'), tone: failed.length > 0 ? 'alert' : 'confirmation' };
};
