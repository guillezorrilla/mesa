import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const gitStatus = defineCommand({
  name: 'git status',
  summary: 'Show changes in a registered project or one of its worktrees',
  args: ['project'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git status lantern-cove --json',
  run: async ({ mesa, args, flags }) => {
    const status = await mesa.git.status(args.project, flags.checkout);
    const changes = columns(
      status.changes.map((change) => [
        `${change.index}${change.workingTree}`,
        change.oldPath ? `${change.oldPath} -> ${change.path}` : change.path,
      ]),
    );
    return {
      data: status,
      text: [`${status.branch ?? '(detached)'} at ${status.checkout.path}`, ...changes].join('\n'),
    };
  },
});

export const gitDiff = defineCommand({
  name: 'git diff',
  summary: 'Show a working or staged diff in a selected project checkout',
  args: ['project', 'path?'],
  flags: {
    checkout: { type: 'string', description: 'Select a linked worktree path' },
    staged: { type: 'boolean', description: 'Show staged changes' },
  },
  example: 'mesa git diff lantern-cove README.md --staged --json',
  run: async ({ mesa, args, flags }) => {
    const diff = await mesa.git.diff(args.project, {
      checkout: flags.checkout,
      path: args.path,
      staged: flags.staged,
    });
    return { data: diff, text: diff.patch || 'no changes' };
  },
});
