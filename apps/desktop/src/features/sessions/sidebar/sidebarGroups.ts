import type { ProjectRow, TreeRow } from '@mesa/core';
import {
  activeSession,
  GENERAL_PROJECT,
  isInternalSession,
  listedSession,
  orderSessions,
  recoverable,
  sessionProjects,
  setupSessionsOf,
} from '@mesa/core/browser';

/** A child shown inside its parent's card: its row and how far below the card it sits (1 or more). */
export type NestedRow = { session: TreeRow; depth: number };

/**
 * The sidebar's lists: the visible projects (pinned first), and in the Sessions tab's order
 * (pinned, then those with active sessions, then the rest), the active sessions (oldest first),
 * the recoverable ones, and the active cards in no listed project, split into General and Other;
 * a project's active cards by primary, in its saved session order (inProject, the Sessions
 * tab's groups); and those it is
 * primary or additional in (touching, the Projects tab's count; CONTEXT.md, Additional project).
 * A card is an active or recoverable session whose parent is not active: an active session's
 * active and recoverable children sit inside its card (crewOf, its descendants oldest first, each
 * followed by its own), while an ended one, with nothing left to open, drops out. Mesa's own
 * plumbing (isInternalSession) is neither: a Skill run shows nowhere, a Setup session only as its
 * owner's mark when it failed (failedSetupsOf). What is listed at all is listedSession's, which
 * the phone's Agents tab shares.
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
  const shown = (session: TreeRow) => !isInternalSession(session);
  const listed = sessions.filter(listedSession);
  const activeIds = new Set(active.map((session) => session.id));
  const parentOf = (session: TreeRow) => (session.managed ? session.parentNow : undefined);
  /** Not inside an active parent's card. */
  const onTop = (session: TreeRow) => !activeIds.has(parentOf(session) ?? '');
  const cards = active.filter((session) => shown(session) && onTop(session));
  const stranded = sessions.filter(
    (session) => recoverable(session) && shown(session) && onTop(session),
  );
  // `seen` stops at a loop of hand-edited parents (sessionTree places those at the top).
  const crewOf = (id: string, depth = 1, seen = new Set([id])): NestedRow[] =>
    listed
      .filter((session) => parentOf(session) === id && !seen.has(session.id))
      .flatMap((session) => {
        seen.add(session.id);
        return [{ session, depth }, ...crewOf(session.id, depth + 1, seen)];
      });
  const failedSetupsOf = (id: string) =>
    setupSessionsOf(sessions, id).filter((session) => session.managed && session.setupFailed);
  const unassigned = cards.filter(
    (session) => !session.project || !registered.has(session.project),
  );
  const general = unassigned.filter((session) => session.project === GENERAL_PROJECT);
  const other = unassigned.filter((session) => session.project !== GENERAL_PROJECT);
  const byProject = new Map<string, TreeRow[]>();
  for (const session of cards)
    if (session.project)
      byProject.set(session.project, [...(byProject.get(session.project) ?? []), session]);
  const ordered = new Map(
    visible.map((project) => [
      project.name,
      orderSessions(byProject.get(project.name) ?? [], project.sessionOrder ?? []),
    ]),
  );
  const inProject = (name: string) => ordered.get(name) ?? [];
  const touching = (name: string) =>
    active.filter((session) => session.managed && sessionProjects(session).includes(name));
  const busy = (name: string) => Number(inProject(name).length > 0);
  const byActivity = [...visible].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || busy(b.name) - busy(a.name),
  );
  return {
    visible,
    byActivity,
    active,
    stranded,
    general,
    other,
    inProject,
    touching,
    crewOf,
    failedSetupsOf,
  };
}

export type SidebarGroups = ReturnType<typeof sidebarGroups>;

/**
 * The session ids in the order the Sessions tab shows their cards: each listed project's (none
 * for a folded one), then General, Other, and Recoverable.
 */
export function sidebarOrder(groups: SidebarGroups, closedProjects: readonly string[]) {
  const { byActivity, stranded, general, other, inProject } = groups;
  const projects = byActivity
    .filter((project) => !closedProjects.includes(project.name))
    .flatMap((project) => inProject(project.name));
  return [...projects, ...general, ...other, ...stranded].map((session) => session.id);
}
