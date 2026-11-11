import type { OpenFlags } from './open-input.js';

/** What `mesa worker` takes beside its project and task. */
export type WorkerFlags = {
  agent?: string;
  branch?: string;
  parent?: string;
  model?: string;
  effort?: string;
};

/**
 * The open a Worker is (CONTEXT.md, Worker): `task` as its goal, which gets the worker brief, a
 * child of the caller's session or `parent`, in a new worktree on a branch Mesa names or on
 * `branch`. `worker` makes the open refuse, inside its recorded action, what a worker cannot be
 * (validateOpenInput, parentOf).
 */
export const workerOpen = (task: string, flags: WorkerFlags = {}): Omit<OpenFlags, 'project'> => ({
  worker: true,
  goal: task,
  ...(flags.parent === undefined ? {} : { parent: flags.parent }),
  ...(flags.agent === undefined ? {} : { agent: flags.agent }),
  ...(flags.model === undefined ? {} : { model: flags.model }),
  ...(flags.effort === undefined ? {} : { effort: flags.effort }),
  ...(flags.branch === undefined ? { worktree: true } : { branch: flags.branch }),
});
