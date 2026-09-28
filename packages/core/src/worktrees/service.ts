import type { MesaContext } from '../context.js';
import { resolveCheckout } from '../git/checkout.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { createWorktree, worktreeCommand } from './create.js';
import { listWorktrees, type WorktreeFilter } from './inventory.js';
import { applyWorktreeAction, previewWorktreeAction, type WorktreeAction } from './lifecycle.js';

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
    rerun: (project: string, selected: string) =>
      ctx.record(
        {
          summary: () => `Reran worktree setup in ${project}`,
          failure: `Could not rerun worktree setup in ${project}`,
          project: () => project,
          inputs: { project, selected },
        },
        async () => {
          const profile = ctx.open();
          const checkout = await resolveCheckout(profile, ctx.deps.run, project, selected);
          if (checkout.registered)
            throw new MesaError('usage', 'worktree setup can only rerun in a linked worktree');
          return worktreeCommand(
            ctx.deps.run,
            checkout.path,
            profile.config.worktrees.setup,
            'setup',
          );
        },
      ),
    preview: (project: string, action: WorktreeAction, selected?: string) =>
      previewWorktreeAction(ctx.open(), ctx.deps.run, ctx.store, project, action, selected),
    apply: (project: string, action: WorktreeAction, token: string, selected?: string) =>
      ctx.record(
        {
          summary: (result) => `${action} worktrees in ${project}: ${result.paths.length} changed`,
          failure: `Could not ${action} worktrees in ${project}`,
          project: () => project,
          inputs: { project, action, selected, token },
          outputs: (result) => ({ ...result }),
          warning: (result) =>
            result.remaining?.length
              ? `${result.remaining.length} stale worktree registrations remain; inspect them again`
              : undefined,
        },
        () =>
          applyWorktreeAction(
            ctx.open(),
            ctx.deps.run,
            ctx.store,
            project,
            action,
            token,
            selected,
          ),
      ),
  };
}
