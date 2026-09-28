import { MesaError, type WorktreeRow } from '@mesa/core';
import { defineCommand } from '../command.js';

export const worktreesList = defineCommand({
  name: 'worktrees list',
  summary: 'List Git worktrees and their current Mesa session holders',
  args: ['project'],
  flags: {
    branch: { type: 'string', description: 'Filter branch names' },
    holder: { type: 'string', description: 'Filter by session id' },
    state: { type: 'string', description: 'Filter ready, locked, stale, or detached' },
  },
  example: 'mesa worktrees list lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const state = flags.state;
    if (state && !['ready', 'locked', 'stale', 'detached'].includes(state))
      throw new MesaError('usage', 'state must be ready, locked, stale, or detached');
    const data = await mesa.worktrees.list(args.project, {
      branch: flags.branch,
      holder: flags.holder,
      state: state as WorktreeRow['state'] | undefined,
    });
    return {
      data,
      text:
        data
          .map(
            (row) =>
              `${row.main ? 'main' : (row.branch ?? 'detached')}  ${row.path}  ${row.state}  ${row.holders.map((holder) => holder.id).join(',')}`,
          )
          .join('\n') || 'no worktrees',
    };
  },
});
