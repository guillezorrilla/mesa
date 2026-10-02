import { useEffect, useRef } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { NativeNotice } from '@/lib/platform';
import { useRun } from '@/lib/useCommand';
import type { WorkspaceView } from '../navigation';

/** How often the app sends pending native notifications. */
const DELIVERY_INTERVAL_MS = 5_000;

/**
 * Sends the pending native notifications while the system allows them, now and every five
 * seconds, and opens a clicked one's target (including the one that launched the app) through
 * `navigate`, which must be stable. Each notice is sent at most once: one delivery runs at a time,
 * even across a re-run of the effect. Core claims each notice across the app and scheduler before sending, so a
 * failed mark leaves it pending rather than sounding it again every poll. A failed send loses only
 * the banner; the Inbox keeps the notice.
 */
export function useNativeNotifications(navigate: (view: WorkspaceView) => void) {
  const { notifications } = usePlatform();
  const run = useRun();
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    const deliver = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const status = await notifications.status();
        if (!active || !['authorized', 'provisional', 'ephemeral'].includes(status.authorization))
          return;
        const plan = await run('notifications.claimDelivery');
        if (!active || !plan || plan.kind === 'none') return;
        await notifications.send(plan);
      } catch {
        // A failed native send is not retried: the notice stays in the Inbox.
      } finally {
        busy.current = false;
      }
    };
    void deliver();
    const timer = window.setInterval(() => void deliver(), DELIVERY_INTERVAL_MS);
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
      window.clearInterval(timer);
      stop?.();
    };
  }, [notifications, run, navigate]);
}
