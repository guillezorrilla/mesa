import { defineCommand } from '../command.js';
import { columns } from '../format.js';
import { withReceipt } from '../receipt-output.js';

export const projects = defineCommand({
  name: 'projects',
  summary: 'List the projects registered with this profile',
  run: ({ mesa }) => {
    const rows = mesa.projects.list();
    const text = rows.length
      ? columns(
          rows.map((p) => [p.name, p.path, p.agent, p.priority, p.exists ? '' : '(missing)']),
        ).join('\n')
      : 'no projects registered; run mesa register <path>';
    return { data: rows, text };
  },
});

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
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.projects.register(args.path, flags.create ?? false);
    const { project, path, created } = recorded.result;
    const note = created ? ' (wrote mesa.yaml)' : '';
    const { receipt, text } = withReceipt(recorded, `registered ${project.name} at ${path}${note}`);
    return { data: { ...project, path, created, ...receipt }, text };
  },
});

export const unregister = defineCommand({
  name: 'unregister',
  summary: 'Remove a project from this profile by name',
  args: ['name'],
  run: ({ mesa, args }) => {
    const entry = mesa.projects.unregister(args.name);
    return { data: entry, text: `unregistered ${entry.name}` };
  },
});
