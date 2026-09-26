import { defineCommand } from '../command.js';

export const unregister = defineCommand({
  name: 'unregister',
  summary: 'Remove a project from this profile by name',
  args: ['name'],
  example: 'mesa unregister lantern-cove',
  run: ({ mesa, args }) => {
    const entry = mesa.projects.unregister(args.name);
    return { data: entry, text: `unregistered ${entry.name}` };
  },
});
