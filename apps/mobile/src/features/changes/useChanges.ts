import { useState } from 'react';
import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';

/**
 * ponytail: which files were viewed lives in memory, per session, until the app quits; keep it
 * on the Mac if it should outlive that or reach the desktop.
 */
const viewed = new Map<string, ReadonlySet<string>>();

/** Which files of the changes kept under `key` (a session, a PR) were marked viewed. */
export function useViewed(key: string) {
  const [seen, setSeen] = useState(() => viewed.get(key) ?? new Set<string>());
  const toggleViewed = (file: string) => {
    const next = new Set(seen);
    if (!next.delete(file)) next.add(file);
    viewed.set(key, next);
    setSeen(next);
  };
  return { seen, toggleViewed };
}

/** A session's changed files, and which of them were marked viewed. */
export function useChanges(id: string) {
  const { answer, again, refreshing } = useMacRead({ method: 'changes', id }, SLOW_MS);
  return { answer, again, refreshing, ...useViewed(id) };
}
