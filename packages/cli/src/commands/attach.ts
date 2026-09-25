import { MesaError, TERMINAL_APPS } from '@mesa/core';
import { defineCommand } from '../command.js';

/** tmux attach needs a terminal; say so before anything prints `opened`. */
export function requireTty(tty: boolean) {
  if (!tty)
    throw new MesaError('usage', 'not a terminal: run this in one, or use mesa attach --app');
}

export const attach = defineCommand({
  name: 'attach',
  summary: "Attach to a session's tmux window here, or in your terminal app with --app",
  args: ['session'],
  flags: {
    app: {
      type: 'boolean',
      description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
    },
  },
  run: async ({ mesa, args, flags, tty }) => {
    if (!flags.app) requireTty(tty);
    const { attached, exec } = await mesa.sessions.attach(args.session, flags.app ?? false);
    const where = attached.app ? `in ${attached.app}` : 'here';
    return { data: attached, text: `attaching to ${attached.target} ${where}`, exec };
  },
});
