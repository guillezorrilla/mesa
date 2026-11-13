import { useState } from 'react';
import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';

/**
 * ponytail: which files were viewed lives in memory, per session, until the app quits; keep it
 * on the Mac if it should outlive that or reach the desktop.
 */
const viewed = new Map<string, ReadonlySet<string>>();

/** A session's changed files, and which of them were marked viewed. */
export function useChanges(id: string) {
  const { answer, again, refreshing } = useMacRead({ method: 'changes', id }, SLOW_MS);
  const [seen, setSeen] = useState(() => viewed.get(id) ?? new Set<string>());
  const toggleViewed = (key: string) => {
    const next = new Set(seen);
    if (!next.delete(key)) next.add(key);
    viewed.set(id, next);
    setSeen(next);
  };
  return { answer, again, refreshing, seen, toggleViewed };
}
