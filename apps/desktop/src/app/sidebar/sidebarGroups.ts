import type { ProjectRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { activeSession, recoverable } from '@/features/sessions/rows';

/**
 * The sidebar's lists: the visible projects (pinned first), the active sessions, the recoverable
 * ones, and the active ones in no listed project, split into General and Other.
 */
export function sidebarGroups(projects: readonly ProjectRow[], sessions: readonly TreeRow[]) {
  const visible = projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  const active = sessions.filter(activeSession);
  const stranded = sessions.filter(recoverable);
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const general = unassigned.filter((session) => session.project === GENERAL_PROJECT);
  const other = unassigned.filter((session) => session.project !== GENERAL_PROJECT);
  return { visible, active, stranded, general, other };
}

export type SidebarGroups = ReturnType<typeof sidebarGroups>;
