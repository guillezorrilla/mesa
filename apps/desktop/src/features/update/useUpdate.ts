import { useEffect, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { UpdateStatus } from '@/lib/platform';

/** The updater's status as Rust reports it, kept current, and its actions. */
export function useUpdate() {
  const { updates } = usePlatform();
  const [status, setStatus] = useState<UpdateStatus>();
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void updates
      .onStatus((next) => {
        if (active) setStatus(next);
      })
      .then((unlisten) => {
        if (!active) return unlisten();
        stop = unlisten;
        void updates.status().then((first) => {
          if (active) setStatus(first);
        });
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [updates]);
  return { ...updates, status };
}

/** One line on where the updater is, for the menu and Settings. */
export function describeUpdate(status: UpdateStatus | undefined): string {
  switch (status?.phase) {
    case 'checking':
      return 'Checking for updates...';
    case 'downloading':
      return `Downloading v${status.version}...`;
    case 'ready':
      return `v${status.version} is ready to install.`;
    case 'up-to-date':
      return 'Mesa is up to date.';
    case 'unsupported':
      return `v${status.version} is available. ${status.message}`;
    case 'failed':
      return status.message ?? 'The update check failed.';
    default:
      return 'Mesa checks for updates at launch and every 4 hours.';
  }
}
