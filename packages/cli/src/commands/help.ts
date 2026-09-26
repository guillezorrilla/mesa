import { GLOBAL_FLAGS } from '../cli.js';
import { defineCommand } from '../command.js';
import { agentReference, mainHelp, reference } from '../help.js';

export const help = defineCommand({
  name: 'help',
  summary: 'Print the command list; --agent prints the full reference as Markdown, for agents',
  flags: {
    agent: {
      type: 'boolean',
      description: 'Every command with its usage, flags, and an example, as Markdown',
    },
  },
  example: 'mesa help --agent',
  // The data is the reference either way; --agent picks the Markdown over the short list.
  run: ({ commands, flags }) => ({
    data: reference(commands),
    text: flags.agent ? agentReference(commands, GLOBAL_FLAGS) : mainHelp(commands, GLOBAL_FLAGS),
  }),
});
