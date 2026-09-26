import { defineCommand, GLOBAL_FLAGS } from '../command.js';
import { commandReference, mainHelp, referenceMarkdown } from '../help.js';

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
  run: ({ commands, flags }) => {
    const reference = commandReference(commands);
    const text = flags.agent
      ? referenceMarkdown(reference, GLOBAL_FLAGS)
      : mainHelp(commands, GLOBAL_FLAGS);
    return { data: reference, text };
  },
});
