import { actionable } from '@mesa/core/browser';
import { createContext, useContext, useEffect, useRef } from 'react';
import { useOptional } from '@/lib/useCommand';
import { useReadAt } from '@/lib/useReadAt';

/** How often the list reads itself again. */
export const PRS_EVERY_MS = 15 * 60_000;
/** How old the list must be before coming back to the window reads it again. */
export const PRS_STALE_MS = 2 * 60_000;

/**
 * The Reviews list for every project, or `project`'s: read on mount, on refresh, every 15 minutes,
 * and when the window gains focus with a read over 2 minutes old; with when it was last read and
 * how many PRs ask something of me.
 */
export function usePrs(args: { project?: string; all?: boolean } = {}) {
  // Optional: before a profile exists there is nothing to list, and that is no failure.
  const list = useOptional('prs', args);
  const readAt = useReadAt(list.data);
  const lastRead = useRef(readAt);
  lastRead.current = readAt;
  const { refresh } = list;
  useEffect(() => {
    const again = () => void refresh();
    const back = () => {
      if (Date.now() - (lastRead.current ?? 0) >= PRS_STALE_MS) again();
    };
    const timer = setInterval(again, PRS_EVERY_MS);
    window.addEventListener('focus', back);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', back);
    };
  }, [refresh]);
  const toAct = list.data?.prs.filter((pr) => actionable(pr.bucket)).length ?? 0;
  return { list, readAt, toAct };
}

export type Prs = ReturnType<typeof usePrs>;

/** The app's one read of every project's list (App): the sidebar, project screens and setup share it. */
export const PrsContext = createContext<Prs | undefined>(undefined);

/** The app's list, when App provides it. */
export const useSharedPrs = () => useContext(PrsContext);
