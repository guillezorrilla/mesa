import type { TreeRow } from '@mesa/core';
import { nameAsk, wantsName } from '@mesa/core/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useCall, useRun } from '@/lib/useCommand';

/**
 * Refresh session state every two seconds and after actions, without overlapping requests. A row
 * the Board is unsure of is placed by the chosen model beside the look, never inside it; the next
 * look shows the reply, so a screen that keeps changing costs at most one ask per look. A session
 * no one has named is named (mesa rename --auto) once per ask (wantsName, nameAsk): once from its
 * item's title, else once per turn, between turns, until it has one.
 */
export function useSessions() {
  const run = useRun();
  const call = useCall();
  const [data, setData] = useState<TreeRow[]>();
  // The first look has answered, rows or a failure.
  const [loaded, setLoaded] = useState(false);
  // The ask (nameAsk) each session was last asked a name for.
  const asked = useRef(new Map<string, string>());
  const look = useMemo(() => {
    // Quietly: a model that fails leaves the rules' state, and the row says why.
    const place = oneAtATime(async () => {
      await call('decisions.place');
    });
    return oneAtATime(async () => {
      const rows = await run('sessions.list');
      setLoaded(true);
      if (!rows) return;
      setData(rows);
      if (rows.some((row) => row.managed && row.supervision.pending)) void place();
      for (const row of rows) {
        if (!wantsName(row) || asked.current.get(row.id) === nameAsk(row)) continue;
        asked.current.set(row.id, nameAsk(row));
        // Quietly: no name yet is tried again after the next turn.
        void call('sessions.autoName', { id: row.id });
      }
    });
  }, [run, call]);
  useEffect(() => {
    look();
    const timer = setInterval(look, 2000);
    return () => clearInterval(timer);
  }, [look]);
  return { data, loaded, look };
}
