import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { callerOf } from '../sessions/caller.js';
import { projectScope } from '../sessions/general.js';
import type { SessionRecord } from '../sessions/record.js';
import { sessionProjects } from '../sessions/session-projects.js';

/**
 * Whom a kept record belongs to (CONTEXT.md, Decision and Session write): the project and session
 * given, the session defaulting to the Caller when it is on that project, and the Caller as the
 * actor. A session is on each of its projects, the primary and every additional one. The project,
 * when there is one, must be registered (not_found); a session not on it is a usage error.
 */
export function recordScope(
  ctx: MesaContext,
  given: { project?: string; session?: string },
): { project?: string; session?: SessionRecord; actor?: SessionRecord } {
  const actor = callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session;
  const on = (r: SessionRecord | undefined, project: string | undefined) =>
    r !== undefined && project !== undefined && sessionProjects(r).includes(project);
  const session = given.session
    ? ctx.store.get(given.session)
    : on(actor, given.project)
      ? actor
      : undefined;
  const project = given.project ?? (session && projectScope(session.project));
  if (project) findProject(ctx.open(), project);
  if (session && given.project && !on(session, given.project)) {
    throw new MesaError(
      'usage',
      `session ${session.id} is on ${sessionProjects(session).join(', ')}, not ${given.project}`,
    );
  }
  return {
    ...(project ? { project } : {}),
    ...(session ? { session } : {}),
    ...(actor ? { actor } : {}),
  };
}
