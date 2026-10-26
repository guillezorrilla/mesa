import { defineCommand } from '../command.js';

export const unread = defineCommand({
  name: 'unread',
  summary: 'Mark a session unread, to come back to it; opening it marks it read',
  args: ['session'],
  example: 'mesa unread a1b2c3d4',
  run: ({ mesa, args }) => {
    const r = mesa.sessions.unread(args.session);
    return { data: { id: r.id, unread: true }, text: `${r.id} is unread` };
  },
});
