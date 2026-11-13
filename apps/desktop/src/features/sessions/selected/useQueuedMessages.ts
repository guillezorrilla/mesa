import { useEffect } from 'react';
import { useCommand, useRun } from '@/lib/useCommand';
import { useSessionEvents } from '@/lib/useSessionEvents';

/** How often the list is read again while a reply waits: one the phone removed leaves within it. */
const WAITING_POLL_MS = 2000;

/**
 * Session `session`'s queued replies from the phone (CONTEXT.md, Queued message), read again on
 * each session event (a delivery is one), and every 2 s while any wait, since a removal on the
 * phone writes no event; `remove` takes one back.
 */
export function useQueuedMessages(session: string) {
  const read = useCommand('queue.list', { session });
  const run = useRun();
  useSessionEvents(() => void read.refresh());
  const waiting = Boolean(read.data?.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read.refresh changes only with the session.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void read.refresh(), WAITING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, session]);
  const remove = async (id: string) => {
    // Gone at once once the Mac removed it; a failure (typed already) toasts, and the read shows why.
    if (await run('queue.remove', { id })) read.mutate((list) => list.filter((m) => m.id !== id));
    await read.refresh();
  };
  return { queued: read.data ?? [], remove };
}
