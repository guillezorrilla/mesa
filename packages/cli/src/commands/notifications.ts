import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const notifications = defineCommand({
  name: 'notifications',
  summary: 'List profile-local input, finished-turn, and subagent notices',
  example: 'mesa notifications',
  run: ({ mesa }) => {
    const items = mesa.notifications.list();
    return {
      data: items,
      text: items.length
        ? columns(
            items.map((item) => [
              item.read ? 'read' : 'unread',
              item.at,
              item.session,
              item.title,
              item.id,
            ]),
          ).join('\n')
        : 'no notifications',
    };
  },
});

export const notificationsRead = defineCommand({
  name: 'notifications read',
  summary: 'Mark an inbox item read',
  args: ['id'],
  example: 'mesa notifications read 2026-09-24T12:00:00.000Z:abc123',
  run: ({ mesa, args }) => {
    mesa.notifications.markRead(args.id);
    return { data: { id: args.id, read: true }, text: `Marked ${args.id} read` };
  },
});

export const notificationsClear = defineCommand({
  name: 'notifications clear',
  summary: 'Clear an inbox item without deleting its source event',
  args: ['id'],
  example: 'mesa notifications clear 2026-09-24T12:00:00.000Z:abc123',
  run: ({ mesa, args }) => {
    mesa.notifications.clear(args.id);
    return { data: { id: args.id, cleared: true }, text: `Cleared ${args.id}` };
  },
});
