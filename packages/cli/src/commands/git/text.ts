import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';

const AGENT_FLAG = {
  type: 'string',
  description:
    'claude, codex, or antigravity; default: the project mesa.yaml, else the profile default',
} as const;

export const gitMessage = defineCommand({
  name: 'git message',
  summary:
    "Write a commit message for a checkout's staged changes with an agent, from the project's git.commitMessageRecipe; commits nothing",
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG, agent: AGENT_FLAG },
  example: 'mesa git message lantern-cove --json',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.git.message(args.project, {
      checkout: flags.checkout,
      agent: flags.agent,
    });
    return { data, text: data.message };
  },
});
