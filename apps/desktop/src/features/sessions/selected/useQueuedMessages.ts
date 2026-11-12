import { useCommand, useRun } from '@/lib/useCommand';
import { useSessionEvents } from '@/lib/useSessionEvents';

/**
 * Session `session`'s queued replies from the phone (CONTEXT.md, Queued message), read again on
 * each session event (a delivery is one) and the fallback poll; `remove` takes one back.
 */
export function useQueuedMessages(session: string) {
  const read = useCommand('queue.list', { session });
  const run = useRun();
  useSessionEvents(() => void read.refresh());
  const remove = async (id: string) => {
    await run('queue.remove', { id });
    await read.refresh();
  };
  return { queued: read.data ?? [], remove };
}
