import type { Config, TreeRow } from '@mesa/core';
import { waitingForInput } from '@mesa/core/browser';
import { useEffect } from 'react';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * The visual alert: how many sessions wait for input (0 when the profile turns it off), set as the
 * Dock badge once the config has loaded.
 */
export function useVisualAlert(config: Config | undefined, sessions: readonly TreeRow[]): number {
  const { dock } = usePlatform();
  const visualAlert = config?.notifications?.visualAlert ?? true;
  const waiting = visualAlert ? sessions.filter(waitingForInput).length : 0;
  useEffect(() => {
    if (!config) return;
    // A badge that fails to set leaves the app as it was; the next change tries again.
    void dock.badge(waiting).catch(() => {});
  }, [config, dock, waiting]);
  return waiting;
}
