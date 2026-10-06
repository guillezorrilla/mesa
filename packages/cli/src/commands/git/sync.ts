import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

export const gitTracking = defineCommand({
  name: 'git tracking',
  summary: 'Show the selected branch and its configured remote upstream',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git tracking lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const target = await mesa.git.tracking(args.project, flags.checkout);
    return { data: target, text: `${target.branch} tracks ${target.remote}/${target.upstream}` };
  },
});

const syncFlags = {
  checkout: CHECKOUT_FLAG,
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
