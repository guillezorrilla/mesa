import type { MesaContext } from '../context.js';
import { listWorktrees, type WorktreeFilter } from './inventory.js';

export function worktreesService(ctx: MesaContext) {
  return {
    list: (project: string, filter?: WorktreeFilter) =>
      listWorktrees(ctx.open(), ctx.deps.run, ctx.store, project, filter),
  };
}
