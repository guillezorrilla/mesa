import { createContext, useContext, useEffect, useState } from 'react';
import { useOptional } from '@/lib/useCommand';
import { actionable } from './prGroups';

/**
 * The Reviews list for every project, or `project`'s: read once on mount and again on refresh,
 * never polled, with when it was last read and how many PRs ask something of me.
 */
export function usePrs(args: { project?: string; all?: boolean } = {}) {
  // Optional: before a profile exists there is nothing to list, and that is no failure.
  const list = useOptional('prs', args);
  const [readAt, setReadAt] = useState<number>();
  useEffect(() => {
    if (list.data) setReadAt(Date.now());
  }, [list.data]);
  const toAct = list.data?.prs.filter(actionable).length ?? 0;
  return { list, readAt, toAct };
}

/** The app's one read of every project's list (App), so a project screen reads nothing of its own. */
export const PrsContext = createContext<ReturnType<typeof usePrs> | undefined>(undefined);

/** The app's list, when App provides it. */
export const useSharedPrs = () => useContext(PrsContext);
