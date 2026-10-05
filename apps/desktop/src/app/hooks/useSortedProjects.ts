import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import { useEffect, useState } from 'react';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The sidebar's project order: the profile's saved sort (`projects.sort`) over `projects`,
 * refreshed when the list changes, when sessions change under an activity-based sort, and when a
 * sort is picked, which saves it. Selecting `visited` records the visit but never reorders the
 * list under the cursor; a visit-based order catches up on the next launch or pick.
 */
export function useSortedProjects(
  projects: readonly ProjectRow[] | undefined,
  sessions: readonly TreeRow[],
  visited: string | undefined,
  saved: ProjectSort | undefined,
) {
  const run = useRun();
  const [picked, setPicked] = useState<ProjectSort>();
  const sort = picked ?? saved ?? 'name';
  const sorted = useCommand('projects.sorted', sort);
  useEffect(() => {
    if (projects) void sorted.refresh();
  }, [projects, sorted.refresh]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: session refreshes keep activity-based project sorting current.
  useEffect(() => {
    if (sort === 'active-sessions' || sort === 'last-session') void sorted.refresh();
  }, [sessions, sort, sorted.refresh]);
  useEffect(() => {
    if (visited) void run('projects.visit', { name: visited });
  }, [visited, run]);
  const setSort = (next: ProjectSort) => {
    setPicked(next);
    if (next === sort) void sorted.refresh();
    void run('config.set', { path: 'projects.sort', value: next });
  };
  return { sort, setSort, sorted: sorted.data };
}
