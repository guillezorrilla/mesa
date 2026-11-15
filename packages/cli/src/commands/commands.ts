import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const commands = defineCommand({
  name: 'commands',
  summary: "List the slash commands an agent offers a session or project, as the chat's menu does",
  args: ['target'],
  flags: {
    agent: {
      type: 'string',
      description: "claude, codex or antigravity (default: the session's agent, else claude)",
    },
  },
  example: 'mesa commands lantern-cove --agent codex',
  run: ({ mesa, args, flags }) => {
    const rows = mesa.commands(args.target, flags.agent);
    return {
      data: rows,
      text: rows.length
        ? columns(
            rows.map((c) => [`/${c.name}`, c.source, c.argumentHint ?? '', c.description]),
          ).join('\n')
        : 'no commands',
    };
  },
});
