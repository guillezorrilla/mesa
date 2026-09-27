import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const projects = defineCommand({
  name: 'projects',
  summary: 'List the projects registered with this profile',
  example: 'mesa projects',
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

/** Presentation settings stay in this profile's registry; the project slug is never renamed. */
export const projectsUpdate = defineCommand({
  name: 'projects update',
  summary: 'Set a project label, pin or hide it, or move it within its group',
  args: ['name'],
  flags: {
    label: { type: 'string', description: 'Display label, 1-80 characters' },
    pinned: { type: 'string', description: 'true or false' },
    hidden: { type: 'string', description: 'true or false' },
    move: { type: 'string', description: 'up or down' },
  },
  example: 'mesa projects update lantern-cove --pinned true',
  run: ({ mesa, args, flags }) => {
    const bool = (name: 'pinned' | 'hidden') => {
      const value = flags[name];
      if (value !== undefined && value !== 'true' && value !== 'false') {
        throw new MesaError('usage', `--${name} must be true or false`);
      }
      return value === undefined ? undefined : value === 'true';
    };
    const move = flags.move;
    if (move !== undefined && move !== 'up' && move !== 'down') {
      throw new MesaError('usage', '--move must be up or down');
    }
    const recorded = mesa.projects.update(args.name, {
      ...(flags.label !== undefined ? { label: flags.label } : {}),
      ...(flags.pinned !== undefined ? { pinned: bool('pinned') } : {}),
      ...(flags.hidden !== undefined ? { hidden: bool('hidden') } : {}),
      ...(move !== undefined ? { move } : {}),
    });
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `updated project ${args.name}`,
    });
  },
});

export const projectsDiscover = defineCommand({
  name: 'projects discover',
  summary: 'Find local Git repositories or mesa.yaml projects under a folder, within three levels',
  args: ['path'],
  example: 'mesa projects discover ~/src',
  run: ({ mesa, args }) => {
    const rows = mesa.projects.discover(args.path);
    return {
      data: rows,
      text: rows.length
        ? columns(
            rows.map((row) => [row.name, row.path, row.registered ? '(registered)' : '']),
          ).join('\n')
        : 'no projects found',
    };
  },
});

export const projectsClone = defineCommand({
  name: 'projects clone',
  summary: 'Clone an HTTPS/SSH repository or Mesa project link into this profile and register it',
  args: ['url'],
  example: 'mesa projects clone https://example.com/team/lantern-cove.git',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.projects.clone(args.url);
    const { project, path, created } = recorded.result;
    return recordedOutput(recorded, {
      data: { ...project, path, created, url: recorded.result.url },
      text: `cloned ${project.name} at ${path}`,
    });
  },
});
