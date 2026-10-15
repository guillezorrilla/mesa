import type { ManagedRow } from '@mesa/core';
import { useEffect, useMemo, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useCall } from '@/lib/useCommand';

/**
 * The profile's archived sessions, newest archive first (`mesa sessions --archived`), read again
 * whenever `board` (the board's session ids) changes, as an archive or an unarchive moves a
 * session between the two, and on `look`. Quiet: a failed read keeps the last list.
 */
export function useArchivedSessions(board: string) {
  const call = useCall();
  const [rows, setRows] = useState<ManagedRow[]>([]);
  const look = useMemo(
    () =>
      oneAtATime(async () => {
        const result = await call('sessions.archived');
        if (result.ok) setRows(result.data);
      }),
    [call],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed board asks for a fresh list.
  useEffect(() => {
    void look();
  }, [look, board]);
  return { rows, look };
}
