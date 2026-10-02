import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The sidebar's project order: the chosen sort over `projects`, refreshed when the list changes,
 * when sessions change under an activity-based sort, and after `visited` (the project in view) is
 * recorded as visited.
 */
export function useSortedProjects(
  projects: readonly ProjectRow[] | undefined,
  sessions: readonly TreeRow[],
  visited: string | undefined,
) {
  const run = useRun();
  const [sort, setSort] = useState<ProjectSort>('recent');
  const sorted = useCommand('projects.sorted', sort);
  useEffect(() => {
    if (projects) void sorted.refresh();
  }, [projects, sorted.refresh]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: session refreshes keep activity-based project sorting current.
  useEffect(() => {
    if (sort === 'active-sessions' || sort === 'last-session') void sorted.refresh();
  }, [sessions, sort, sorted.refresh]);
  const refreshSorted = useRef(sorted.refresh);
  refreshSorted.current = sorted.refresh;
  useEffect(() => {
    if (visited) void run('projects.visit', { name: visited }).then(() => refreshSorted.current());
  }, [visited, run]);
  return { sort, setSort, sorted: sorted.data };
}
