import { defineCommand } from '../command.js';

export const read = defineCommand({
  name: 'read',
  summary: 'Mark a session read, as when you open it in the app',
  args: ['session'],
  example: 'mesa read a1b2c3d4',
  run: ({ mesa, args }) => {
    const r = mesa.sessions.read(args.session);
    return { data: { id: r.id, unread: false }, text: `${r.id} is read` };
  },
});
