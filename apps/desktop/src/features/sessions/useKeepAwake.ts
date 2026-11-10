import type { TreeRow } from '@mesa/core';
import { type KeepAwakeMode, wantsAwake } from '@mesa/core/browser';
import { useEffect, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * Keep awake (CONTEXT.md): holds the Mac's idle-sleep assertion while `mode` wants it over the
 * rows the app already polls, and releases it otherwise or on unmount. True while it is held.
 */
export function useKeepAwake(mode: KeepAwakeMode | undefined, sessions: readonly TreeRow[]) {
  const { awake } = usePlatform();
  const wanted = mode !== undefined && wantsAwake(mode, sessions);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // A failed hold is quiet: the Mac sleeps as it would without Mesa.
    awake.hold().then(
      () => live && setHeld(true),
      () => undefined,
    );
    return () => {
      live = false;
      setHeld(false);
      awake.release().catch(() => undefined);
    };
  }, [wanted, awake]);
  return held;
}
