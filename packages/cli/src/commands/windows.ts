import { defineCommand } from '../command.js';
import { columns } from '../format.js';

export const windows = defineCommand({
  name: 'windows',
  summary: "List the tmux windows on this profile's Mesa server, or one project's",
  args: ['project?'],
  example: 'mesa windows lantern-cove',
  run: async ({ mesa, args }) => {
    const rows = await mesa.windows(args.project);
    const text = rows.length
      ? columns(
          rows.map((w) => [`${w.project}:${w.window}`, w.dead ? '(exited)' : w.command, w.path]),
        ).join('\n')
      : 'no Mesa tmux windows';
    return { data: rows, text };
  },
});
