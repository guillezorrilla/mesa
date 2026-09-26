import { stringify } from 'yaml';
import { defineCommand } from '../command.js';

export const show = defineCommand({
  name: 'show',
  summary: "Print one session's record, and whether it is alive",
  args: ['session'],
  example: 'mesa show a1b2c3d4',
  run: async ({ mesa, args }) => {
    const shown = await mesa.sessions.show(args.session);
    return { data: shown, text: stringify(shown).trimEnd() };
  },
});
