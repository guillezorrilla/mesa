import type { ProjectRow, TreeRow } from '@mesa/core';
import { activeSession, GENERAL_PROJECT, recoverable, sessionProjects } from '@mesa/core/browser';

/**
 * The sidebar's lists: the visible projects (pinned first), the active sessions (oldest first),
 * the recoverable ones, and the active ones in no listed project, split into General and Other;
 * a project's active sessions by primary (inProject, the Sessions tab's groups); and those it is
 * primary or additional in (touching, the Projects tab's count; CONTEXT.md, Additional project).
 */
export function sidebarGroups(projects: readonly ProjectRow[], sessions: readonly TreeRow[]) {
  const visible = projects
    .filter((project) => !project.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const registered = new Set(visible.map((project) => project.name));
  // In the order they were opened, so a card keeps its place as attention changes.
  const active = sessions
    .filter(activeSession)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const stranded = sessions.filter(recoverable);
  const unassigned = active.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const general = unassigned.filter((session) => session.project === GENERAL_PROJECT);
  const other = unassigned.filter((session) => session.project !== GENERAL_PROJECT);
  const inProject = (name: string) => active.filter((session) => session.project === name);
  const touching = (name: string) =>
    active.filter((session) => session.managed && sessionProjects(session).includes(name));
  return { visible, active, stranded, general, other, inProject, touching };
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
