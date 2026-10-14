import { actionable } from '@mesa/core/browser';
import { createContext, useContext } from 'react';
import { useOptional } from '@/lib/useCommand';
import { useReadAt } from '@/lib/useReadAt';

/**
 * The Reviews list for every project, or `project`'s: read once on mount and again on refresh,
 * never polled, with when it was last read and how many PRs ask something of me.
 */
export function usePrs(args: { project?: string; all?: boolean } = {}) {
  // Optional: before a profile exists there is nothing to list, and that is no failure.
  const list = useOptional('prs', args);
  const readAt = useReadAt(list.data);
  const toAct = list.data?.prs.filter((pr) => actionable(pr.bucket)).length ?? 0;
  return { list, readAt, toAct };
}

export type Prs = ReturnType<typeof usePrs>;

/** The app's one read of every project's list (App): the sidebar, project screens and setup share it. */
export const PrsContext = createContext<Prs | undefined>(undefined);

/** The app's list, when App provides it. */
export const useSharedPrs = () => useContext(PrsContext);
