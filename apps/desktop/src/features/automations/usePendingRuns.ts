import { useEffect } from 'react';
import { useCommand } from '@/lib/useCommand';

const PENDING_INTERVAL_MS = 60_000;

/** How many automation runs wait for approval, read again every minute. */
export function usePendingRuns() {
  const status = useCommand('automations.status');
  const { refresh } = status;
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), PENDING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return status.data?.runs.filter((run) => run.status === 'pending').length ?? 0;
}
