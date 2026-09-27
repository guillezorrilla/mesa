import { TERMINAL_APPS } from '@mesa/core';
import { defineCommand } from '../command.js';
import { requireTty } from '../guards.js';

export const view = defineCommand({
  name: 'view',
  summary:
    "Show a project's sessions side by side in one tmux window, laid out by its mesa.yaml tmux.layout, here or in your terminal app with --app",
  args: ['project'],
  flags: {
    app: {
      type: 'boolean',
      description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
    },
  },
  example: 'mesa view lantern-cove --app',
  run: async ({ mesa, args, flags, tty }) => {
    if (!flags.app) requireTty(tty);
    const { viewed, exec } = await mesa.sessions.view(args.project, flags.app ?? false);
    const where = viewed.app ? `in ${viewed.app}` : 'here';
    const count = viewed.sessions.length;
    const text = `viewing ${count} session${count === 1 ? '' : 's'} of ${viewed.project}, ${viewed.layout}, ${where}`;
    return { data: viewed, text, exec };
  },
});
