import type { TreeRow } from '@mesa/core';
import { wantsName } from '@mesa/core/browser';
import { useEffect, useMemo, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useCall, useNewFailureAlert } from '@/lib/useCommand';

/**
 * Refresh session state every two seconds and after actions, without overlapping requests. A row
 * the Board is unsure of is placed by the chosen model beside the look, never inside it; the next
 * look shows the reply, so a screen that keeps changing costs at most one ask per look. A session
 * no one has named is named (mesa rename --auto) when it wants one (wantsName): once from its
 * item's title, else once per turn, between turns, until it has one.
 */
export function useSessions() {
  const call = useCall();
  const alertNew = useNewFailureAlert();
  const [data, setData] = useState<TreeRow[]>();
  // The first look has answered, rows or a failure.
  const [loaded, setLoaded] = useState(false);
  const look = useMemo(() => {
    // Quietly: a model that fails leaves the rules' state, and the row says why.
    const place = oneAtATime(async () => {
      await call('decisions.place');
    });
    return oneAtATime(async () => {
      const result = await call('sessions.list');
      setLoaded(true);
      // Every two seconds: a failure alerts once, not on each look.
      alertNew(result.ok ? undefined : result.error);
      if (!result.ok) return;
      const rows = result.data;
      setData(rows);
      if (rows.some((row) => row.managed && row.supervision.pending)) void place();
      // Quietly: core asks each once (nameAsk), and no name yet is tried at the next ask.
      for (const row of rows) if (wantsName(row)) void call('sessions.autoName', { id: row.id });
    });
  }, [call, alertNew]);
  useEffect(() => {
    look();
    const timer = setInterval(look, 2000);
    return () => clearInterval(timer);
  }, [look]);
  return { data, loaded, look };
}
