import { searchWorkspace } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const search = defineCommand({
  name: 'search',
  summary: 'Find places, actions, settings, projects, and sessions, best match first',
  args: ['words...'],
  flags: {
    sessions: {
      type: 'boolean',
      description: 'Only sessions, open ones by last activity: the app session switcher',
    },
  },
  example: 'mesa search lantern',
  run: async ({ mesa, args, flags }) => {
    const hits = searchWorkspace(
      mesa.projects.list(),
      await mesa.sessions.tree(),
      args.words.join(' '),
      { shortcuts: mesa.config.get().shortcuts, sessionsOnly: flags.sessions },
    );
    return {
      data: hits,
      text: hits.length
        ? columns(
            hits.map((hit) => [
              hit.kind,
              hit.label,
              hit.detail,
              hit.shortcut ?? '',
              hit.disabled ? '(unavailable)' : '',
            ]),
          ).join('\n')
        : 'no matches',
    };
  },
});
