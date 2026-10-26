import { defineCommand } from '../command.js';
import { markedOutput } from '../output/marked.js';

export const unread = defineCommand({
  name: 'unread',
  summary: 'Mark sessions unread, to come back to them; opening one marks it read',
  args: ['session', 'more...'],
  example: 'mesa unread a1b2c3d4',
  run: ({ mesa, args }) => markedOutput(mesa.sessions.unread([args.session, ...args.more]), true),
});
