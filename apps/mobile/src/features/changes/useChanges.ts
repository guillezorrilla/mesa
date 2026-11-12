import { useState } from 'react';
import { useMacRead } from '../mac/useMacRead';

/**
 * ponytail: which files were viewed lives in memory, per session, until the app quits; keep it
 * on the Mac if it should outlive that or reach the desktop.
 */
/** A large diff on a busy Mac takes longer to read than the 10 s most calls get. */
export const DIFF_MS = 30_000;

const viewed = new Map<string, ReadonlySet<string>>();

/** A file at its current patch: a file changed again since it was viewed is unviewed. */
export const viewedKey = (file: { path: string; rev: string }) => `${file.rev}:${file.path}`;

/** A session's changed files, and which of them were marked viewed. */
export function useChanges(id: string) {
  const { answer, again, refreshing } = useMacRead({ method: 'changes', id }, DIFF_MS);
  const [seen, setSeen] = useState(() => viewed.get(id) ?? new Set<string>());
  const toggleViewed = (key: string) => {
    const next = new Set(seen);
    if (!next.delete(key)) next.add(key);
    viewed.set(id, next);
    setSeen(next);
  };
  return { answer, again, refreshing, seen, toggleViewed };
}
