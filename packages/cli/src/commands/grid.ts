import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const grid = defineCommand({
  name: 'grid',
  summary: 'List saved terminal grid groups in this profile',
  example: 'mesa grid',
  run: ({ mesa }) => {
    const groups = mesa.grid.list();
    return {
      data: groups,
      text: groups.length
        ? groups
            .map(
              (group) =>
                `${group.name}  ${group.project ?? 'all projects'}  ${group.sessions.join(' ')}`,
            )
            .join('\n')
        : 'no grid groups',
    };
  },
});

export const gridSave = defineCommand({
  name: 'grid save',
  summary: 'Save or update a named set of terminal tiles',
  args: ['name', 'sessions...'],
  flags: { project: { type: 'string', description: 'Show the group on this project tab' } },
  example: 'mesa grid save review a1b2c3d4',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.grid.save({
      name: args.name,
      project: flags.project,
      sessions: args.sessions,
    });
    return recordedOutput(recorded, {
      data: { groups: recorded.result.groups },
      text: `saved grid group ${args.name}`,
    });
  },
});

export const gridRemove = defineCommand({
  name: 'grid remove',
  summary: 'Remove a saved terminal grid group; sessions are kept',
  args: ['name'],
  example: 'mesa grid remove review',
  run: ({ mesa, args }) => {
    const recorded = mesa.grid.remove(args.name);
    return recordedOutput(recorded, {
      data: { groups: recorded.result.groups },
      text: `removed grid group ${args.name}`,
    });
  },
});
