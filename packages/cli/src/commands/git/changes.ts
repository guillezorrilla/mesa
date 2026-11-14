import { type HunkPick, MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG, wholeNumber } from '../../input/flags.js';
import { columns } from '../../output/columns.js';
import { recordedOutput } from '../../output/recorded.js';

export const gitStatus = defineCommand({
  name: 'git status',
  summary: 'Show changes in a registered project or one of its worktrees',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
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
    checkout: CHECKOUT_FLAG,
    staged: { type: 'boolean', description: 'Show staged changes' },
    full: { type: 'boolean', description: 'Include every unchanged line as context' },
  },
  example: 'mesa git diff lantern-cove README.md --staged',
  run: async ({ mesa, args, flags }) => {
    const diff = await mesa.git.diff(args.project, {
      checkout: flags.checkout,
      path: args.path,
      staged: flags.staged,
      full: flags.full,
    });
    return { data: diff, text: diff.patch || 'no changes' };
  },
});

/** One hunk of a path's diff instead of the whole path (core git/hunk.ts). */
const HUNK_FLAGS = {
  hunk: { type: 'string', description: 'Only this hunk, 0-based in `mesa git diff` order' },
  expect: {
    type: 'string',
    description:
      'With --hunk, the range it was read with, `--expect=-<old>,<count> +<new>,<count>`; refused when it changed',
  },
} as const;

function hunkOf(flags: { hunk?: string; expect?: string }): HunkPick | undefined {
  if (flags.hunk === undefined) {
    if (flags.expect !== undefined) throw new MesaError('usage', '--expect needs --hunk');
    return undefined;
  }
  return {
    index: wholeNumber(flags.hunk, '--hunk'),
    ...(flags.expect === undefined ? {} : { expect: flags.expect }),
  };
}

const what = (path: string, hunk: HunkPick | undefined) =>
  hunk ? `hunk ${hunk.index} of ${path}` : path;

export const gitStage = defineCommand({
  name: 'git stage',
  summary: 'Stage one literal path, or one hunk of its unstaged diff, in a project checkout',
  args: ['project', 'path'],
  flags: { checkout: CHECKOUT_FLAG, ...HUNK_FLAGS },
  example: 'mesa git stage lantern-cove README.md --hunk 1',
  run: async ({ mesa, args, flags }) => {
    const hunk = hunkOf(flags);
    const recorded = await mesa.git.stage(args.project, args.path, flags.checkout, hunk);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `staged ${what(args.path, hunk)}`,
    });
  },
});

export const gitUnstage = defineCommand({
  name: 'git unstage',
  summary:
    'Unstage one literal path, or one hunk of its staged diff, without changing the working file',
  args: ['project', 'path'],
  flags: { checkout: CHECKOUT_FLAG, ...HUNK_FLAGS },
  example: 'mesa git unstage lantern-cove README.md --hunk 0',
  run: async ({ mesa, args, flags }) => {
    const hunk = hunkOf(flags);
    const recorded = await mesa.git.unstage(args.project, args.path, flags.checkout, hunk);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `unstaged ${what(args.path, hunk)}`,
    });
  },
});

export const gitCommit = defineCommand({
  name: 'git commit',
  summary: 'Commit staged changes in a selected project checkout',
  args: ['project'],
  flags: {
    checkout: CHECKOUT_FLAG,
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
