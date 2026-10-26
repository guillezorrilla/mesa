import { defineCommand } from '../command.js';

export const unread = defineCommand({
  name: 'unread',
  summary: 'Mark sessions unread, to come back to them; opening one marks it read',
  args: ['session', 'more...'],
  example: 'mesa unread a1b2c3d4',
  run: ({ mesa, args }) => {
    const ids = mesa.sessions.unread([args.session, ...args.more]).map((r) => r.id);
    return {
      data: ids.length > 1 ? ids.map((id) => ({ id, unread: true })) : { id: ids[0], unread: true },
      text: `${ids.join(', ')} ${ids.length > 1 ? 'are' : 'is'} unread`,
    };
  },
});
