import type { TreeRow } from '@mesa/core';
import { asleep } from '@mesa/core/browser';
import { useEffect, useRef } from 'react';

/**
 * Wakes the shown session when it sleeps (CONTEXT.md, Sleeping session), once per sleep, so
 * opening it is enough: its terminal attaches when the look after the wake shows it awake.
 */
export function useWakeShown(row: TreeRow | undefined, wake: (id: string) => unknown) {
  const woken = useRef<string | undefined>(undefined);
  const sleep = row?.managed && asleep(row) ? `${row.id}@${row.sleeping?.at}` : undefined;
  const latest = useRef(wake);
  latest.current = wake;
  useEffect(() => {
    if (!sleep || !row || woken.current === sleep) return;
    woken.current = sleep;
    void latest.current(row.id);
  }, [sleep, row]);
}
