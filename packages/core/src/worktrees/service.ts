import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { resolveCheckout } from '../projects/checkout.js';
import { findProject } from '../projects/projects.js';
import { applyWorktreeAction } from './apply.js';
import { defaultBranchRef } from './base.js';
import { createWorktree, worktreeCommand } from './create.js';
import { withDetails } from './details.js';
import type { WorktreeAction, WorktreeScope } from './facts.js';
import { listWorktrees, type WorktreeFilter } from './inventory.js';
import { previewWorktreeAction } from './preview.js';
import { worktreeScript } from './settings.js';

export function worktreesService(ctx: MesaContext) {
  const scope = (project: string): WorktreeScope => ({
    profile: ctx.open(),
    run: ctx.run,
    store: ctx.store,
    project,
  });
  return {
    /** The inventory, each row with what its card shows (withDetails). */
    list: async (project: string, filter?: WorktreeFilter) => {
      const profile = ctx.open();
      const rows = await listWorktrees(profile, ctx.run, ctx.store, project, filter);
      const root = rows.find((row) => row.main)?.path;
      const base = root ? await defaultBranchRef(profile, ctx.run, root, project) : undefined;
      return withDetails(ctx.run, rows, base);
    },
    /** How many worktrees the project has, without the details `list` reads. */
    count: async (project: string) =>
      (await listWorktrees(ctx.open(), ctx.run, ctx.store, project)).length,
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
            ctx.run,
            ctx,
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
          const checkout = await resolveCheckout(profile, ctx.run, project, selected);
          if (checkout.registered)
            throw new MesaError('usage', 'worktree setup can only rerun in a linked worktree');
          return worktreeCommand(
            ctx.run,
            checkout.path,
            worktreeScript(profile, findProject(profile, project), 'setup'),
            'setup',
          );
        },
      ),
    preview: (project: string, action: WorktreeAction, selected?: string) =>
      previewWorktreeAction(scope(project), action, selected),
    apply: (
      project: string,
      action: WorktreeAction,
      token: string,
      selected?: string,
      opts: { force?: boolean; deleteBranch?: boolean } = {},
    ) =>
      ctx.record(
        {
          summary: (result) => `${action} worktrees in ${project}: ${result.paths.length} changed`,
          failure: `Could not ${action} worktrees in ${project}`,
          project: () => project,
          inputs: { project, action, selected, token, ...opts },
          outputs: (result) => ({ ...result }),
          warning: (result) =>
            result.remaining?.length
              ? `${result.remaining.length} stale worktree registrations remain; inspect them again`
              : undefined,
        },
        () => applyWorktreeAction(scope(project), action, token, selected, opts),
      ),
  };
}
