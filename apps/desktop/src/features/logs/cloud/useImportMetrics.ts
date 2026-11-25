import { useToast } from '@/components/Toast';
import { useCall, useCommand } from '@/lib/useCommand';

/**
 * Imports each GCP project's log-based metrics as saved views (logs.importMetrics), one after
 * another; a project whose import fails toasts why, and the config is read again so the sidebar's
 * views show the new ones.
 */
export function useImportMetrics() {
  const call = useCall();
  const toast = useToast();
  const config = useCommand('config.get');
  return async (projects: readonly string[]) => {
    let added = 0;
    for (const project of projects) {
      const done = await call('logs.importMetrics', { project });
      if (done.ok) added += done.data.views.length;
      else toast(`Saved views from ${project}'s metrics: ${done.error.message}`);
    }
    await config.refreshEverywhere();
    return added;
  };
}
