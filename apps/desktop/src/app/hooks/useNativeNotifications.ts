import { useEffect } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { NativeNotice } from '@/lib/platform';
import { useRun } from '@/lib/useCommand';
import type { WorkspaceView } from '../navigation';

/** How often the app sends pending native notifications. */
const DELIVERY_INTERVAL_MS = 5_000;

/**
 * Sends the pending native notifications while the system allows them, now and every five
 * seconds, and opens a clicked one's target (including the one that launched the app) through
 * `navigate`, which must be stable.
 */
export function useNativeNotifications(navigate: (view: WorkspaceView) => void) {
  const { notifications } = usePlatform();
  const run = useRun();
  useEffect(() => {
    let active = true;
    let busy = false;
    const deliver = async () => {
      if (busy) return;
      busy = true;
      try {
        const status = await notifications.status();
        if (!active || !['authorized', 'provisional', 'ephemeral'].includes(status.authorization))
          return;
        const plan = await run('notifications.delivery');
        if (!active || !plan || plan.kind === 'none') return;
        await notifications.send(plan);
        if (active) await run('notifications.delivered', { ids: plan.ids });
      } catch {
        // A failed native send stays pending for the next poll.
      } finally {
        busy = false;
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
    void notifications.onOpen(open).then(async (unlisten) => {
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
