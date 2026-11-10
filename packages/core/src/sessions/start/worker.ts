import { MesaError } from '../../lib/result.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionStore } from '../record/store.js';
import type { Caller } from '../window/caller.js';
import type { OpenFlags } from './open-input.js';

/** What `mesa worker` takes beside its project and task. */
export type WorkerFlags = { agent?: string; branch?: string; parent?: string };

/** The agents a worker runs: the ones whose turns report back (CONTEXT.md, Child report). */
const WORKER_AGENTS = ['claude', 'codex'];

/**
 * The open a worker is (CONTEXT.md, Worker brief): `task` as its goal, which gets the brief, a
 * child of the caller's session or `parent`, in a new worktree on a branch Mesa names or on
 * `branch`. Refused, starting nothing, outside a Mesa window without `parent`, for an unknown
 * parent, a General project, or an agent that does not report.
 */
export function workerOpen(
  deps: { store: SessionStore; caller: () => Caller },
  project: string | undefined,
  task: string,
  flags: WorkerFlags = {},
): Omit<OpenFlags, 'project'> & { project: string } {
  if (!project || project === GENERAL_PROJECT)
    throw new MesaError('usage', 'a worker needs a project with a repository, not General');
  if (flags.agent !== undefined && !WORKER_AGENTS.includes(flags.agent))
    throw new MesaError('usage', `a worker runs ${WORKER_AGENTS.join(' or ')}, not ${flags.agent}`);
  const parent = flags.parent ?? deps.caller().session?.id;
  if (parent === undefined)
    throw new MesaError(
      'usage',
      'mesa worker runs inside a Mesa window; outside one pass --parent <id>',
    );
  if (!deps.store.find(parent))
    throw new MesaError('not_found', `no session ${parent} to be the parent; see mesa sessions`);
  return {
    project,
    goal: task,
    parent,
    ...(flags.agent ? { agent: flags.agent } : {}),
    ...(flags.branch === undefined ? { worktree: true } : { branch: flags.branch }),
  };
}
