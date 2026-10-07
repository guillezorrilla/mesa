import type { TreeRow } from '@mesa/core';
import { useEffect, useMemo, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useCall, useRun } from '@/lib/useCommand';

/**
 * Refresh session state every two seconds and after actions, without overlapping requests. A row
 * the Board is unsure of is placed by the chosen model beside the look, never inside it; the next
 * look shows the reply, so a screen that keeps changing costs at most one ask per look.
 */
export function useSessions() {
  const run = useRun();
  const call = useCall();
  const [data, setData] = useState<TreeRow[]>();
  const look = useMemo(() => {
    // Quietly: a model that fails leaves the rules' state, and the row says why.
    const place = oneAtATime(async () => {
      await call('decisions.place');
    });
    return oneAtATime(async () => {
      const rows = await run('sessions.list');
      if (!rows) return;
      setData(rows);
      if (rows.some((row) => row.managed && row.supervision.pending)) void place();
    });
  }, [run, call]);
  useEffect(() => {
    look();
    const timer = setInterval(look, 2000);
    return () => clearInterval(timer);
  }, [look]);
  return { data, look };
}
