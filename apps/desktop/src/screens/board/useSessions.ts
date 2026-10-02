import type { TreeRow } from '@mesa/core';
import { useEffect, useMemo, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useRun } from '@/lib/useCommand';

/**
 * Refresh session state every two seconds and after actions, without overlapping requests. These
 * looks never wait on Faro's adapter, which can take seconds per unsure session: it is asked
 * beside them, and the next look shows the answer it saved.
 */
export function useSessions() {
  const run = useRun();
  const [data, setData] = useState<TreeRow[]>();
  const look = useMemo(
    () =>
      oneAtATime(async () => {
        const rows = await run('sessions.list');
        if (rows) setData(rows);
      }),
    [run],
  );
  const refine = useMemo(
    () =>
      oneAtATime(async () => {
        await run('sessions.refine');
      }),
    [run],
  );
  useEffect(() => {
    look();
    const timer = setInterval(() => {
      look();
      refine();
    }, 2000);
    return () => clearInterval(timer);
  }, [look, refine]);
  return { data, look };
}
