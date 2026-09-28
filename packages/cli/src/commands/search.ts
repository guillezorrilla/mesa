import { searchWorkspace } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const search = defineCommand({
  name: 'search',
  summary: 'Find actions, settings, projects, and recent sessions',
  args: ['words...'],
  example: 'mesa search lantern',
  run: async ({ mesa, args }) => {
    const hits = searchWorkspace(
      mesa.projects.list(),
      await mesa.sessions.tree(),
      args.words.join(' '),
    );
    return {
      data: hits,
      text: hits.length
        ? columns(
            hits.map((hit) => [
              hit.kind,
              hit.label,
              hit.detail,
              hit.disabled ? '(unavailable)' : '',
            ]),
          ).join('\n')
        : 'no matches',
    };
  },
});
