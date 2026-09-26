import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const register = defineCommand({
  name: 'register',
  summary: 'Register the project at a path from its mesa.yaml',
  args: ['path'],
  flags: {
    create: {
      type: 'boolean',
      description: 'Write a minimal mesa.yaml named after the folder first',
    },
  },
  example: 'mesa register ~/src/lantern-cove --create',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.projects.register(args.path, flags.create ?? false);
    const { project, path, created } = recorded.result;
    const note = created ? ' (wrote mesa.yaml)' : '';
    const text = `registered ${project.name} at ${path}${note}`;
    return recordedOutput(recorded, { data: { ...project, path, created }, text });
  },
});
