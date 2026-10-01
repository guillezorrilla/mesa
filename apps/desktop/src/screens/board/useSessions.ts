import type { TreeRow } from '@mesa/core';
import { useEffect, useMemo, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useRun } from '@/lib/useCommand';

/** Refresh session state every two seconds and after actions, without overlapping requests. */
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
  useEffect(() => {
    look();
    const timer = setInterval(look, 2000);
    return () => clearInterval(timer);
  }, [look]);
  return { data, look };
}
