import { defineCommand } from '../command.js';

export const keys = defineCommand({
  name: 'keys',
  summary:
    'Press keys in a plain terminal session, in order: Escape, Tab, Enter, Up, Down, Left, Right or C-<letter>; a person only',
  args: ['session', 'keys...'],
  example: 'mesa keys a1b2c3d4 C-c Up Enter',
  run: async ({ mesa, args }) => {
    const r = await mesa.sessions.terminal.keys(args.session, args.keys);
    return { data: r, text: `pressed ${r.keys.join(' ')} in ${r.session}` };
  },
});
