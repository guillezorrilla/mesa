import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const rm = defineCommand({
  name: 'rm',
  summary:
    "Remove a session's record, hook log, output log, and a run's output, and with flags its worktree and branch",
  args: ['session'],
  flags: {
    force: {
      type: 'boolean',
      description: 'Close a live session first, and remove a worktree with changes',
    },
    'delete-worktree': { type: 'boolean', description: 'Also remove its git worktree' },
    'delete-branch': { type: 'boolean', description: 'Also delete its branch' },
  },
  example: 'mesa rm a1b2c3d4 --delete-worktree --delete-branch',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.remove(args.session, {
      force: flags.force,
      deleteWorktree: flags['delete-worktree'],
      deleteBranch: flags['delete-branch'],
    });
    const r = recorded.result;
    const also = [
      r.window && 'its window',
      r.events && 'its hook log',
      r.outputLog && 'its output log',
      r.runOutput && 'its run output',
      r.worktree && `worktree ${r.worktree}`,
      r.branch && `branch ${r.branch}`,
    ].filter(Boolean);
    const text = `removed ${r.id}${also.length ? `, with ${also.join(', ')}` : ''}`;
    return recordedOutput(recorded, { data: r, text });
  },
});
