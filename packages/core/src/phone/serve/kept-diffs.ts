/** How long a session's diff read serves the pages after it. */
export const DIFF_KEPT_MS = 60_000;

/**
 * A session's diff read, kept for the pages that follow it: reading a 1 MB diff again for each of
 * its 50 pages took 2 to 30 s a page on a busy Mac, against well under a second kept. `reuse`
 * takes a kept read under DIFF_KEPT_MS old; without it (the file list, a pull to refresh) the diff
 * is read anew and kept. ponytail: a page read within the minute after an edit shows the patch the
 * list was read from, which is the one the phone is paging.
 */
export function keptDiffs<T>(read: (id: string) => Promise<T>, now: () => number) {
  const kept = new Map<string, { at: number; read: Promise<T> }>();
  return (id: string, reuse = false): Promise<T> => {
    const last = kept.get(id);
    if (reuse && last && now() - last.at < DIFF_KEPT_MS) return last.read;
    const next = read(id);
    kept.set(id, { at: now(), read: next });
    next.catch(() => kept.delete(id));
    return next;
  };
}
