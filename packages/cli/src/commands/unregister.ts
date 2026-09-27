import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const unregister = defineCommand({
  name: 'unregister',
  summary: 'Remove a project from this profile by name',
  args: ['name'],
  example: 'mesa unregister lantern-cove',
  run: ({ mesa, args }) => {
    const recorded = mesa.projects.unregister(args.name);
    const entry = recorded.result;
    return recordedOutput(recorded, { data: entry, text: `unregistered ${entry.name}` });
  },
});
