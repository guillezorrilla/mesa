import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { columns } from '../../output/columns.js';
import { recordedOutput } from '../../output/recorded.js';

export const gitStashes = defineCommand({
  name: 'git stashes',
  summary: 'List saved stashes for the selected project checkout',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
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
    checkout: CHECKOUT_FLAG,
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
  flags: {
    checkout: CHECKOUT_FLAG,
    oid: { type: 'string', description: 'Refuse unless the ref still names this listed stash' },
  },
  example: "mesa git stash apply lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashApply(args.project, args.ref, flags.checkout, flags.oid);
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
  flags: {
    checkout: CHECKOUT_FLAG,
    oid: { type: 'string', description: 'Refuse unless the ref still names this listed stash' },
  },
  example: "mesa git stash pop lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashPop(args.project, args.ref, flags.checkout, flags.oid);
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
  flags: {
    checkout: CHECKOUT_FLAG,
    oid: { type: 'string', description: 'Refuse unless the ref still names this listed stash' },
  },
  example: "mesa git stash drop lantern-cove 'stash@{0}'",
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.stashDrop(args.project, args.ref, flags.checkout, flags.oid);
    return recordedOutput(recorded, { data: recorded.result, text: `dropped ${args.ref}` });
  },
});
