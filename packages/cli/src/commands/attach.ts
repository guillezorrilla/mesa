import { TERMINAL_APPS } from '@mesa/core';
import { defineCommand } from '../command.js';
import { requireTty } from '../guards.js';

/** tmux attach needs a terminal; say so before anything prints `opened`. */
export const attach = defineCommand({
  name: 'attach',
  summary: "Attach to a session's tmux window here, or in your terminal app with --app",
  args: ['session'],
  flags: {
    app: {
      type: 'boolean',
      description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
    },
    print: {
      type: 'boolean',
      description:
        'Print the attach argv instead of attaching (the app runs it in its own terminal)',
    },
  },
  example: 'mesa attach a1b2c3d4 --print',
  run: async ({ mesa, args, flags, tty }) => {
    if (flags.print) {
      const { attached, exec = [] } = await mesa.sessions.attach(args.session, false);
      return { data: { target: attached.target, argv: exec }, text: exec.join(' ') };
    }
    if (!flags.app) requireTty(tty);
    const { attached, exec } = await mesa.sessions.attach(args.session, flags.app ?? false);
    const where = attached.app ? `in ${attached.app}` : 'here';
    return { data: attached, text: `attaching to ${attached.target} ${where}`, exec };
  },
});
