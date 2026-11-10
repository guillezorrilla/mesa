import { defineCommand } from '../../command.js';
import { AGENT_FLAG, CHECKOUT_FLAG } from '../../input/flags.js';

export const gitMessage = defineCommand({
  name: 'git message',
  summary:
    "Write a commit message for a checkout's staged changes with an agent, from the project's git.commitMessageRecipe; commits nothing",
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG, agent: AGENT_FLAG },
  example: 'mesa git message lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.git.message(args.project, {
      checkout: flags.checkout,
      agent: flags.agent,
    });
    return { data, text: data.message };
  },
});

export const gitPrText = defineCommand({
  name: 'git pr-text',
  summary:
    "Draft a pull request title and body for a checkout's branch with an agent, from the project's git.pullRequestRecipe; opens nothing",
  args: ['project'],
  flags: {
    checkout: CHECKOUT_FLAG,
    base: {
      type: 'string',
      description: "The ref it merges into; default: the project's default branch",
    },
    agent: AGENT_FLAG,
  },
  example: 'mesa git pr-text lantern-cove --base main',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.git.prText(args.project, {
      checkout: flags.checkout,
      base: flags.base,
      agent: flags.agent,
    });
    return { data, text: `${data.title}\n\n${data.body}`.trimEnd() };
  },
});
