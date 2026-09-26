import type { TreeRow } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRun } from '@/lib/useCommand';

type ListName = 'sessions.list' | 'sessions.all';

/** The board looks again this often, and at once after every action. */
const REFRESH_MS = 2000;

/**
 * The Board's rows (`ended`: older sessions too), looked at every two seconds, and `elapsed`, the
 * seconds since they arrived, so running times tick between looks. `collapsed` rows whose rows
 * have all gone open again, so a new one is not hidden. One look at a time: a look asked for
 * while one runs (an action, a tick) happens right after it, for whichever list is wanted then,
 * so a slow board never piles up calls and a late reply for the other list never lands.
 */
export function useBoard(ended: boolean) {
  const run = useRun();
  const list = run as (name: ListName) => Promise<TreeRow[] | undefined>;
  const [data, setData] = useState<TreeRow[]>();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wanted = useRef<ListName>('sessions.list');
  wanted.current = ended ? 'sessions.all' : 'sessions.list';
  const looking = useRef(false);
  const again = useRef(false);
  const look = useCallback(async () => {
    if (looking.current) {
      again.current = true;
      return;
    }
    looking.current = true;
    try {
      do {
        again.current = false;
        const name = wanted.current;
        const rows = await list(name);
        if (rows && wanted.current === name) {
          setData(rows);
          const withRows = new Set(
            rows.filter((r, i) => (rows[i + 1]?.depth ?? -1) > r.depth).map((r) => r.id),
          );
          setCollapsed((was) =>
            was.size ? new Set([...was].filter((id) => withRows.has(id))) : was,
          );
          setSince(Date.now());
        }
      } while (again.current);
    } finally {
      looking.current = false;
    }
  }, [list]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list is wanted when `ended` flips.
  useEffect(() => {
    look();
  }, [look, ended]);
  useEffect(() => {
    const lookAgain = setInterval(look, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(lookAgain);
      clearInterval(tick);
    };
  }, [look]);
  const toggle = (id: string) =>
    setCollapsed((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));
  return { data, look, collapsed, toggle, elapsed };
}
