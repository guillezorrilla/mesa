import type { TreeRow } from '@mesa/core';
import { wantsName } from '@mesa/core/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { oneAtATime } from '@/lib/oneAtATime';
import { useCall, useRun } from '@/lib/useCommand';

/**
 * Refresh session state every two seconds and after actions, without overlapping requests. A row
 * the Board is unsure of is placed by the chosen model beside the look, never inside it; the next
 * look shows the reply, so a screen that keeps changing costs at most one ask per look. A session
 * no one has named is named from its prompts (mesa rename --auto) once per turn until it has one.
 */
export function useSessions() {
  const run = useRun();
  const call = useCall();
  const [data, setData] = useState<TreeRow[]>();
  // The first look has answered, rows or a failure.
  const [loaded, setLoaded] = useState(false);
  // Each session's turn a name was asked for, by its state's time.
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
        if (!wantsName(row) || asked.current.get(row.id) === row.lastState.at) continue;
        asked.current.set(row.id, row.lastState.at);
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
