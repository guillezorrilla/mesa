import { useEffect } from 'react';
import { useCommand } from '@/lib/useCommand';

/** How often a running import's progress is read again. */
const POLL_MS = 1_000;

/**
 * `project`'s running import (`mesa import status`), read again every second while one runs or
 * `starting` says one is about to: it may have been started here, in another window, or by the CLI.
 */
export function useImportProgress(project: string, starting: boolean) {
  const status = useCommand('imports.status', { project });
  const progress = status.data?.progress ?? null;
  const live = starting || Boolean(progress);
  const { refresh } = status;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refresh]);
  return progress;
}
