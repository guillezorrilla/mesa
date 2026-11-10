import { useEffect, useRef } from 'react';
import { useCall } from '@/lib/useCommand';
import { useWindowFocused } from '@/lib/useWindowFocused';
import type { WorkspaceView } from '@/lib/workspaceView';

/** How often the app asks which sessions may sleep. */
export const SLEEP_PASS_MS = 60_000;

/**
 * While `sessions.sleepAfterMinutes` is on, puts finished, read sessions to sleep (mesa sleep)
 * now and every minute, keeping awake the one shown in a focused window, as Unread reads it.
 * A failed pass is quiet; the next one tries again.
 */
export function useSleepIdle(view: WorkspaceView, afterMinutes: number | undefined) {
  const call = useCall();
  const focused = useWindowFocused();
  const shown = useRef<string | undefined>(undefined);
  shown.current = focused && view.kind === 'session' ? view.id : undefined;
  useEffect(() => {
    if (!afterMinutes) return;
    const pass = () =>
      void call('sessions.sleep', shown.current ? { shown: shown.current } : {}).catch(
        () => undefined,
      );
    pass();
    const timer = window.setInterval(pass, SLEEP_PASS_MS);
    return () => window.clearInterval(timer);
  }, [afterMinutes, call]);
}
