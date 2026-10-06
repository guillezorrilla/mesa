import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { columns } from '../../output/columns.js';
import { recordedOutput } from '../../output/recorded.js';

export const gitBranches = defineCommand({
  name: 'git branches',
  summary: 'List local branches and the worktree using each one',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git branches lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const listed = await mesa.git.branches(args.project, flags.checkout);
    return {
      data: listed,
      text: listed.branches.length
        ? columns(
            listed.branches.map((row) => [
              row.current ? '*' : ' ',
              row.name,
              row.oid.slice(0, 7),
              row.upstream ?? '',
              row.checkedOutAt ?? '',
            ]),
          ).join('\n')
        : 'no local branches',
    };
  },
});

export const gitBranchCreate = defineCommand({
  name: 'git branch create',
  summary: 'Create a local branch from HEAD or an explicit commit ref',
  args: ['project', 'name'],
  flags: {
    checkout: CHECKOUT_FLAG,
    base: { type: 'string', description: 'Start from this commit ref (default: HEAD)' },
  },
  example: 'mesa git branch create lantern-cove feature/readme',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.branchCreate(
      args.project,
      args.name,
      flags.checkout,
      flags.base,
    );
    return recordedOutput(recorded, { data: recorded.result, text: `created branch ${args.name}` });
  },
});

export const gitBranchCheckout = defineCommand({
  name: 'git branch checkout',
  summary: 'Switch the selected checkout to a local branch when no session holds it',
  args: ['project', 'name'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git branch checkout lantern-cove feature/readme',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.branchCheckout(args.project, args.name, flags.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `checked out branch ${args.name}`,
    });
  },
});

export const gitBranchDelete = defineCommand({
  name: 'git branch delete',
  summary: 'Delete a fully merged local branch that no worktree uses',
  args: ['project', 'name'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git branch delete lantern-cove feature/readme',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.branchDelete(args.project, args.name, flags.checkout);
    return recordedOutput(recorded, { data: recorded.result, text: `deleted branch ${args.name}` });
  },
});
