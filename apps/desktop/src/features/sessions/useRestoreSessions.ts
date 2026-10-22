import type { EachResult, SessionRecord } from '@mesa/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Message } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/**
 * Recoverable sessions brought back (CONTEXT.md, Interrupted session): once the app opens on a
 * set-up profile, the ones a restart ended resume on their own (`mesa resume --all
 * --interrupted`); the returned Restore all resumes every recoverable one. A toast says how many
 * came back and why any did not; an automatic restore with nothing to do says nothing.
 */
export function useRestoreSessions(ready: boolean) {
  const run = useRun();
  const { act } = useAct();
  const restored = useRef(false);
  const restore = useCallback(
    (interrupted: boolean) =>
      act(async () => {
        const result = await run('sessions.restore', { interrupted });
        return result && restoredMessage(result);
      }),
    [act, run],
  );
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    void restore(true);
  }, [ready, restore]);
  return useCallback(() => void restore(false), [restore]);
}

const restoredMessage = ({ items }: EachResult<SessionRecord>): Message | undefined => {
  if (items.length === 0) return undefined;
  const done = items.filter((item) => item.ok).length;
  const failed = items.flatMap((item) => (item.ok ? [] : [`${item.id}: ${item.error.message}`]));
  return {
    text: [`Restored ${done} ${done === 1 ? 'session' : 'sessions'}`, ...failed].join('\n'),
    tone: failed.length > 0 ? 'alert' : 'confirmation',
  };
};
