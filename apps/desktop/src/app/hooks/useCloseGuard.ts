import type { Config } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';
import { useRun } from '@/lib/useCommand';

/**
 * Guards closing the window once the config has loaded: asks first when the profile warns before
 * quitting, and takes a backup first when it backs up on close. `quitOpen` shows the question;
 * `confirmQuit` and `cancelQuit` answer it.
 */
export function useCloseGuard(config: Config | undefined) {
  const { lifecycle } = usePlatform();
  const run = useRun();
  const toast = useToast();
  const [quitOpen, setQuitOpen] = useState(false);
  const closing = useRef(false);
  const approvedClose = useRef(false);
  const cancelClose = useRef(false);
  const finishQuit = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      if (config?.application?.backupOnClose && !(await run('backup.create'))) return;
      if (cancelClose.current) return;
      approvedClose.current = true;
      await lifecycle.close();
      setQuitOpen(false);
    } catch (error) {
      toast(
        `Could not close Mesa: ${error instanceof Error ? error.message : String(error)}`,
        'alert',
      );
    } finally {
      approvedClose.current = false;
      closing.current = false;
    }
  }, [config?.application?.backupOnClose, lifecycle, run, toast]);
  useEffect(() => {
    if (!config) return;
    let active = true;
    let stop: (() => void) | undefined;
    void lifecycle
      .onCloseRequested((event) => {
        if (approvedClose.current) return;
        event.preventDefault();
        cancelClose.current = false;
        if (config?.application?.warnBeforeQuit ?? true) setQuitOpen(true);
        else void finishQuit();
      })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [config?.application?.warnBeforeQuit, config, lifecycle, finishQuit]);
  return {
    quitOpen,
    /** True while a close is under way. */
    closing: closing.current,
    confirmQuit: () => {
      cancelClose.current = false;
      void finishQuit();
    },
    cancelQuit: () => {
      cancelClose.current = true;
      setQuitOpen(false);
    },
  };
}
