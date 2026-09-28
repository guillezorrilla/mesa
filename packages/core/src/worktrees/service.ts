import type { MesaContext } from '../context.js';
import { findProject } from '../projects/projects.js';
import { createWorktree } from './create.js';
import { listWorktrees, type WorktreeFilter } from './inventory.js';

export function worktreesService(ctx: MesaContext) {
  return {
    list: (project: string, filter?: WorktreeFilter) =>
      listWorktrees(ctx.open(), ctx.deps.run, ctx.store, project, filter),
    create: (project: string, branch: string, base?: string) =>
      ctx.record(
        {
          summary: (result) => `Created ${result.branch} worktree in ${project}`,
          failure: `Could not create ${branch} worktree in ${project}`,
          project: () => project,
          inputs: { project, branch, base, settings: ctx.open().config.worktrees },
        },
        () =>
          createWorktree(
            ctx.open(),
            ctx.deps.run,
            ctx.store,
            findProject(ctx.open(), project),
            branch,
            base,
          ),
      ),
  };
}
