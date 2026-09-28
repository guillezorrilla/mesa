import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

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

export const gitStage = defineCommand({
  name: 'git stage',
  summary: 'Stage one literal path in a project checkout',
  args: ['project', 'path'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git stage lantern-cove README.md --json',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stage(args.project, args.path, flags.checkout);
    return recordedOutput(recorded, { data: recorded.result, text: `staged ${args.path}` });
  },
});

export const gitUnstage = defineCommand({
  name: 'git unstage',
  summary: 'Unstage one literal path without changing the working file',
  args: ['project', 'path'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git unstage lantern-cove README.md --json',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.unstage(args.project, args.path, flags.checkout);
    return recordedOutput(recorded, { data: recorded.result, text: `unstaged ${args.path}` });
  },
});

export const gitCommit = defineCommand({
  name: 'git commit',
  summary: 'Commit staged changes in a selected project checkout',
  args: ['project'],
  flags: {
    checkout: { type: 'string', description: 'Select a linked worktree path' },
    message: { type: 'string', required: true, description: 'Commit message' },
  },
  example: 'mesa git commit lantern-cove --message "Update README" --json',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.commit(args.project, flags.message, flags.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `committed ${recorded.result.oid.slice(0, 7)}`,
    });
  },
});
