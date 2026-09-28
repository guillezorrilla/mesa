import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const gitStatus = defineCommand({
  name: 'git status',
  summary: 'Show changes in a registered project or one of its worktrees',
  args: ['project'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git status lantern-cove',
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
  example: 'mesa git diff lantern-cove README.md --staged',
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
  example: 'mesa git stage lantern-cove README.md',
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
  example: 'mesa git unstage lantern-cove README.md',
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
  example: 'mesa git commit lantern-cove --message "Update README"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.commit(args.project, flags.message, flags.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `committed ${recorded.result.oid.slice(0, 7)}`,
    });
  },
});

export const gitBranches = defineCommand({
  name: 'git branches',
  summary: 'List local branches and the worktree using each one',
  args: ['project'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
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
    checkout: { type: 'string', description: 'Select a linked worktree path' },
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
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
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
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git branch delete lantern-cove feature/readme',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.branchDelete(args.project, args.name, flags.checkout);
    return recordedOutput(recorded, { data: recorded.result, text: `deleted branch ${args.name}` });
  },
});

export const gitStashes = defineCommand({
  name: 'git stashes',
  summary: 'List saved stashes for the selected project checkout',
  args: ['project'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git stashes lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const listed = await mesa.git.stashes(args.project, flags.checkout);
    return {
      data: listed,
      text: listed.stashes.length
        ? columns(listed.stashes.map((row) => [row.ref, row.oid.slice(0, 7), row.message])).join(
            '\n',
          )
        : 'no stashes',
    };
  },
});

export const gitStashCreate = defineCommand({
  name: 'git stash create',
  summary: 'Save tracked and untracked changes without ignored files',
  args: ['project'],
  flags: {
    checkout: { type: 'string', description: 'Select a linked worktree path' },
    message: { type: 'string', description: 'Optional stash message' },
  },
  example: 'mesa git stash create lantern-cove --message "Before sync"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashCreate(args.project, flags.checkout, flags.message);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: recorded.result.created
        ? `stashed ${recorded.result.oid?.slice(0, 7)}`
        : 'no changes to stash',
    });
  },
});

export const gitStashApply = defineCommand({
  name: 'git stash apply',
  summary: 'Apply a saved stash and keep it',
  args: ['project', 'ref'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: "mesa git stash apply lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashApply(args.project, args.ref, flags.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `applied ${args.ref}; stash kept`,
    });
  },
});

export const gitStashPop = defineCommand({
  name: 'git stash pop',
  summary: 'Apply a saved stash, then drop it only on success',
  args: ['project', 'ref'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: "mesa git stash pop lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashPop(args.project, args.ref, flags.checkout);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `applied and dropped ${args.ref}`,
    });
  },
});

export const gitStashDrop = defineCommand({
  name: 'git stash drop',
  summary: 'Delete an explicitly selected saved stash',
  args: ['project', 'ref'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: "mesa git stash drop lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashDrop(args.project, args.ref, flags.checkout);
    return recordedOutput(recorded, { data: recorded.result, text: `dropped ${args.ref}` });
  },
});

export const gitTracking = defineCommand({
  name: 'git tracking',
  summary: 'Show the selected branch and its configured remote upstream',
  args: ['project'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git tracking lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const target = await mesa.git.tracking(args.project, flags.checkout);
    return { data: target, text: `${target.branch} tracks ${target.remote}/${target.upstream}` };
  },
});

const syncFlags = {
  checkout: { type: 'string', description: 'Select a linked worktree path' },
  yes: { type: 'boolean', description: 'Proceed when a strict project guardrail asks' },
} as const;

export const gitPush = defineCommand({
  name: 'git push',
  summary: "Explicitly push HEAD to the selected branch's configured upstream without force",
  args: ['project'],
  flags: syncFlags,
  example: 'mesa git push lantern-cove',
  run: async ({ mesa, args, flags, confirm }) => {
    const recorded = await mesa.git.push(args.project, flags.checkout, { yes: flags.yes, confirm });
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `pushed ${recorded.result.branch} to ${recorded.result.remote}/${recorded.result.upstream}`,
    });
  },
});

export const gitPull = defineCommand({
  name: 'git pull',
  summary: "Explicitly pull a fast-forward from the selected branch's configured upstream",
  args: ['project'],
  flags: syncFlags,
  example: 'mesa git pull lantern-cove',
  run: async ({ mesa, args, flags, confirm }) => {
    const recorded = await mesa.git.pull(args.project, flags.checkout, { yes: flags.yes, confirm });
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `pulled ${recorded.result.remote}/${recorded.result.upstream} into ${recorded.result.branch}`,
    });
  },
});

export const gitGraph = defineCommand({
  name: 'git graph',
  summary: 'Show up to 100 commits in all local branches or one selected branch',
  args: ['project'],
  flags: {
    checkout: { type: 'string', description: 'Select a linked worktree path' },
    branch: { type: 'string', description: 'Filter to one local branch' },
  },
  example: 'mesa git graph lantern-cove --branch main',
  run: async ({ mesa, args, flags }) => {
    const graph = await mesa.git.graph(args.project, flags.checkout, flags.branch);
    return {
      data: graph,
      text:
        graph.rows
          .map(
            (row) =>
              `${row.graph}${row.commit ? `${row.commit.oid.slice(0, 7)} ${row.commit.subject}` : ''}`,
          )
          .join('\n') || 'no commits',
    };
  },
});

export const gitCompare = defineCommand({
  name: 'git compare',
  summary: 'Compare two commit refs with divergence counts and a patch',
  args: ['project', 'base', 'head'],
  flags: { checkout: { type: 'string', description: 'Select a linked worktree path' } },
  example: 'mesa git compare lantern-cove main feature/readme',
  run: async ({ mesa, args, flags }) => {
    const compared = await mesa.git.compare(args.project, args.base, args.head, flags.checkout);
    return {
      data: compared,
      text: `${compared.behind} behind, ${compared.ahead} ahead\n${compared.patch}`,
    };
  },
});
