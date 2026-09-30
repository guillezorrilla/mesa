import { defineCommand } from '../command.js';

export const map = defineCommand({
  name: 'map',
  summary: 'Update the saved project/session Canvas; replaces personal map edits without history',
  flags: {
    all: {
      type: 'boolean',
      description: 'Include every saved session, not only the last 30 days and resume ancestors',
    },
  },
  example: 'mesa map --all',
  run: async ({ mesa, flags }) => {
    const saved = await mesa.map({ all: flags.all });
    return {
      data: saved,
      text: `${saved.changed ? 'updated' : 'unchanged'} ${saved.path}: ${saved.groups} groups, ${saved.nodes} nodes, ${saved.edges} edges`,
    };
  },
});
