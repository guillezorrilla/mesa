import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const notifications = defineCommand({
  name: 'notifications',
  summary: 'List profile-local input, finished-turn, subagent, and Doctor notices',
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
              item.fix ? `${item.title} (run mesa ${item.fix})` : item.title,
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
  summary: 'Clear an inbox item, or with --all every one, without deleting their source events',
  args: ['id?'],
  flags: { all: { type: 'boolean', description: 'Clear the whole notification center' } },
  example: 'mesa notifications clear 2026-09-24T12:00:00.000Z:abc123',
  run: ({ mesa, args, flags }) => {
    if (!flags.all === !args.id) throw new MesaError('usage', 'give one inbox item id or --all');
    if (flags.all) {
      const count = mesa.notifications.clearAll();
      return { data: { count }, text: `Cleared ${count} notifications` };
    }
    const id = args.id ?? '';
    mesa.notifications.clear(id);
    return { data: { id, cleared: true }, text: `Cleared ${id}` };
  },
});

export const notificationsDelivery = defineCommand({
  name: 'notifications delivery',
  summary: 'Get the next profile-local macOS notification or digest without requesting permission',
  example: 'mesa notifications delivery',
  run: ({ mesa }) => {
    const plan = mesa.notifications.delivery();
    return { data: plan, text: plan.kind === 'none' ? 'no delivery pending' : plan.title };
  },
});

export const notificationsDelivered = defineCommand({
  name: 'notifications delivered',
  summary: 'Record inbox item IDs accepted by macOS notification delivery',
  args: ['ids'],
  example: 'mesa notifications delivered 2026-09-24T12:00:00.000Z:abc123',
  run: ({ mesa, args }) => {
    const ids = args.ids.split(',');
    mesa.notifications.markDelivered(ids);
    return { data: { ids, delivered: true }, text: `Recorded ${ids.length} delivered` };
  },
});
