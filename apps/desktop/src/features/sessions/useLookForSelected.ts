import type { TreeRow } from '@mesa/core';
import { useEffect, useRef } from 'react';

/** A session the app just opened is looked for at once, not at the next two-second look. */
export function useLookForSelected(
  selectedSession: string | undefined,
  rows: TreeRow[] | undefined,
  look: () => Promise<void>,
) {
  const lookedFor = useRef<string>(undefined);
  useEffect(() => {
    const id = selectedSession;
    if (!id || !rows || rows.some((row) => row.id === id) || lookedFor.current === id) return;
    lookedFor.current = id;
    void look();
  }, [selectedSession, rows, look]);
}
