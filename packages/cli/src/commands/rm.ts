import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { bulkExit } from '../output/bulk.js';
import { recordedOutput } from '../output/recorded.js';

export const rm = defineCommand({
  name: 'rm',
  summary:
    "Remove a session's record, hook log, output log, and a run's output, and with flags its worktree and branch; with --descendants, exits 2 when any item failed",
  args: ['session'],
  flags: {
    force: {
      type: 'boolean',
      description: 'Close a live session first, and remove a worktree with changes or submodules',
    },
    'delete-worktree': {
      type: 'boolean',
      description: "Also remove its git worktree, and each additional project's",
    },
    'delete-branch': {
      type: 'boolean',
      description: "Also delete its branch, and each additional project's",
    },
    descendants: {
      type: 'boolean',
      description: 'Also remove every parent-linked descendant, child first',
    },
    expect: {
      type: 'string',
      description: 'Require these confirmed descendant IDs, comma separated',
    },
  },
  example: 'mesa rm a1b2c3d4 --delete-worktree --delete-branch',
  run: async ({ mesa, args, flags }) => {
    if (flags.expect && !flags.descendants)
      throw new MesaError('usage', '--expect requires --descendants');
    if (flags.descendants && !flags.expect)
      throw new MesaError('usage', '--descendants requires --expect with the confirmed IDs');
    if (flags.descendants) {
      const data = await mesa.sessions.removeDescendants(
        args.session,
        {
          force: flags.force,
          deleteWorktree: flags['delete-worktree'],
          deleteBranch: flags['delete-branch'],
        },
        flags.expect?.split(','),
      );
      return {
        data,
        text: data.items
          .map((item) => `${item.id}: ${item.ok ? 'removed' : item.error.message}`)
          .join('\n'),
        code: bulkExit(data.items.some((item) => !item.ok)),
      };
    }
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
      ...(r.additional ?? []).flatMap((a) => [
        a.worktree && `${a.project}'s worktree ${a.worktree}`,
        a.branch && `${a.project}'s branch ${a.branch}`,
      ]),
    ].filter(Boolean);
    const text = `removed ${r.id}${also.length ? `, with ${also.join(', ')}` : ''}`;
    return recordedOutput(recorded, { data: r, text });
  },
});
