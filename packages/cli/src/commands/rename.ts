import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const rename = defineCommand({
  name: 'rename',
  summary: 'Give a session a name; sessions and the Board show it in place of the id',
  args: ['session', 'name'],
  example: 'mesa rename a1b2c3d4 "tide tables"',
  run: ({ mesa, args }) => {
    const recorded = mesa.sessions.rename(args.session, args.name);
    const r = recorded.result;
    return recordedOutput(recorded, { data: r, text: `renamed ${r.id} to ${r.name}` });
  },
});
