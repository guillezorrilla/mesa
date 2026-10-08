import type { TreeRow } from '@mesa/core';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

/**
 * A session new among `active` since the last render opens its project's folded group in the
 * Sessions tab, so it shows. The first list seen is the baseline: nothing opens on load.
 */
export function useUnfoldOnNewSession(
  active: readonly TreeRow[],
  setClosedProjects: Dispatch<SetStateAction<string[]>>,
) {
  const seen = useRef<ReadonlySet<string>>(undefined);
  const latest = useRef(active);
  latest.current = active;
  const ids = active.map((session) => session.id).join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the active ids change, reading the rows they belong to.
  useEffect(() => {
    const before = seen.current;
    seen.current = new Set(latest.current.map((session) => session.id));
    if (!before) return;
    const opened = latest.current.filter((session) => !before.has(session.id));
    if (opened.length)
      setClosedProjects((current) =>
        current.filter((name) => !opened.some((session) => session.project === name)),
      );
  }, [ids, setClosedProjects]);
}
