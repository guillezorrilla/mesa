import { entryText } from '@mesa/core';
import { defineCommand } from '../../command.js';

export const logsRequest = defineCommand({
  name: 'logs request',
  summary:
    "Print every line of one request or trace id across a project's log sources, in time order, each with its source",
  args: ['id'],
  flags: {
    project: { type: 'string', description: 'Its project (default: this one)' },
  },
  example: 'mesa logs request 7f3a --project lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const found = await mesa.logs.request(args.id, flags.project);
    const lines = found.entries.map((entry) => `${entry.source} ${entryText(entry)}`);
    const failed = found.failed.map((each) => `could not read ${each.source}: ${each.message}`);
    return {
      data: found,
      text: [...(lines.length ? lines : [`no lines name request ${found.id}`]), ...failed].join(
        '\n',
      ),
    };
  },
});
