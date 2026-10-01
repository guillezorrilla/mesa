import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const register = defineCommand({
  name: 'register',
  summary: 'Register the project at a path from its mesa.yaml',
  args: ['path'],
  flags: {
    label: { type: 'string', description: 'Optional display name, 1-80 characters' },
    create: {
      type: 'boolean',
      description: 'Write a minimal mesa.yaml named after the folder first',
    },
  },
  example: 'mesa register ~/src/lantern-cove --create',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.projects.register(args.path, flags.create ?? false, flags.label);
    const { project, path, created, label } = recorded.result;
    const note = created ? ' (wrote mesa.yaml)' : '';
    const text = `registered ${project.name} at ${path}${note}`;
    return recordedOutput(recorded, {
      data: { ...project, path, created, ...(label !== undefined ? { label } : {}) },
      text,
    });
  },
});
