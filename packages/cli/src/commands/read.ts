import { defineCommand } from '../command.js';

export const read = defineCommand({
  name: 'read',
  summary: 'Mark sessions read, as when you open one in the app',
  args: ['session', 'more...'],
  example: 'mesa read a1b2c3d4',
  run: ({ mesa, args }) => {
    const ids = mesa.sessions.read([args.session, ...args.more]).map((r) => r.id);
    return {
      data:
        ids.length > 1 ? ids.map((id) => ({ id, unread: false })) : { id: ids[0], unread: false },
      text: `${ids.join(', ')} ${ids.length > 1 ? 'are' : 'is'} read`,
    };
  },
});
