import { FINISHED_HOLD_MS } from '@mesa/core/browser';
import { useCallback, useEffect, useRef } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { NativeNotice } from '@/lib/platform';
import { useRun } from '@/lib/useCommand';
import { useSessionEvents } from '@/lib/useSessionEvents';
import type { WorkspaceView } from '@/lib/workspaceView';

/**
 * Sends the pending native notifications while the system allows them, now, when a hook event
 * lands and on the fallback poll (useSessionEvents), and opens a clicked one's target (including
 * the one that launched the app) through `navigate`, which must be stable. Each notice is sent at
 * most once: one delivery runs at a time. Core claims each notice across the app and scheduler
 * before sending, so a failed mark leaves it pending rather than sounding it again every poll. A
 * failed send loses only the banner; the Inbox keeps the notice.
 */
export function useNativeNotifications(navigate: (view: WorkspaceView) => void) {
  const { notifications } = usePlatform();
  const run = useRun();
  const busy = useRef(false);
  const mounted = useRef(true);
  const deliver = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const status = await notifications.status();
      if (
        !mounted.current ||
        !['authorized', 'provisional', 'ephemeral'].includes(status.authorization)
      )
        return;
      const plan = await run('notifications.claimDelivery');
      if (!mounted.current || !plan || plan.kind === 'none') return;
      await notifications.send(plan);
    } catch {
      // A failed native send is not retried: the notice stays in the Inbox.
    } finally {
      busy.current = false;
    }
  }, [notifications, run]);
  // A finished turn waits FINISHED_HOLD_MS for its plan, so each event asks again once that is
  // over; the 250 ms covers the look and mark the hold waits for.
  const again = useRef<number | undefined>(undefined);
  useSessionEvents(() => {
    void deliver();
    window.clearTimeout(again.current);
    again.current = window.setTimeout(() => void deliver(), FINISHED_HOLD_MS + 250);
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(again.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    const open = (target: NativeNotice['target']) => {
      if (active)
        navigate(
          target.kind === 'session' ? { kind: 'session', id: target.id } : { kind: target.kind },
        );
    };
    // A click comes as an event and is also kept for a launch; taking it here too means a later
    // takeOpened never replays it.
    void notifications
      .onOpen((target) => {
        void notifications.takeOpened();
        open(target);
      })
      .then(async (unlisten) => {
        if (active) {
          stop = unlisten;
          const target = await notifications.takeOpened();
          if (target) open(target);
        } else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [notifications, navigate]);
}
