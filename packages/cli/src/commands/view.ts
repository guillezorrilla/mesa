import { sessionCount } from '@mesa/core';
import { defineCommand } from '../command.js';
import { APP_FLAG, requireTty } from '../input/flags.js';

export const view = defineCommand({
  name: 'view',
  summary:
    "Show a project's sessions side by side in one tmux window, laid out by its mesa.yaml tmux.layout, here or in your terminal app with --app",
  args: ['project'],
  flags: {
    app: APP_FLAG,
  },
  example: 'mesa view lantern-cove --app',
  run: async ({ mesa, args, flags, tty }) => {
    if (!flags.app) requireTty(tty, 'mesa view --app');
    const { viewed, exec } = await mesa.sessions.view(args.project, flags.app ?? false);
    const where = viewed.app ? `in ${viewed.app}` : 'here';
    const text = `viewing ${sessionCount(viewed.sessions.length)} of ${viewed.project}, ${viewed.layout}, ${where}`;
    return { data: viewed, text, exec };
  },
});
