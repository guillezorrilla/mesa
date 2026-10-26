import { defineCommand } from '../command.js';
import { markedOutput } from '../output/marked.js';

export const read = defineCommand({
  name: 'read',
  summary: 'Mark sessions read, as when you open one in the app',
  args: ['session', 'more...'],
  example: 'mesa read a1b2c3d4',
  run: ({ mesa, args }) => markedOutput(mesa.sessions.read([args.session, ...args.more]), false),
});
