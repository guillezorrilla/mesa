import type { ProjectRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { activeSession, recoverable } from '@/features/sessions/rows';

/**
 * The sidebar's lists: the visible projects (pinned first), the active sessions, the recoverable
 * ones, and the active ones in no listed project, split into General and Other; and a project's
 * active sessions (inProject).
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
  const inProject = (name: string) => active.filter((session) => session.project === name);
  return { visible, active, stranded, general, other, inProject };
}

export type SidebarGroups = ReturnType<typeof sidebarGroups>;

/**
 * The session ids in the order the Sessions tab shows their cards: each listed project's (none
 * for a folded one), then General, Other, and Recoverable.
 */
export function sidebarOrder(groups: SidebarGroups, closedProjects: readonly string[]) {
  const { visible, stranded, general, other, inProject } = groups;
  const projects = visible
    .filter((project) => !closedProjects.includes(project.name))
    .flatMap((project) => inProject(project.name));
  return [...projects, ...general, ...other, ...stranded].map((session) => session.id);
}
