import { defineCommand } from '../command.js';

export const queueList = defineCommand({
  name: 'queue list',
  summary:
    "List the replies the phone queued for busy sessions, each typed in when its session's turn ends",
  args: ['session?'],
  example: 'mesa queue list a1b2c3d4',
  run: ({ mesa, args }) => {
    const data = mesa.phone.queue.list(args.session);
    const text = data
      .map(
        (m) =>
          `${m.id} ${m.session} ${m.at}${m.error ? ` (not sent: ${m.error})` : ''}\n  ${m.text}`,
      )
      .join('\n');
    return { data, text: text || 'nothing queued' };
  },
});

export const queueRemove = defineCommand({
  name: 'queue remove',
  summary: 'Remove a queued reply before its session types it; the phone sees it gone',
  args: ['id'],
  example: 'mesa queue remove 01M78Q7TM78DX2RDCQAYHP14CV',
  run: ({ mesa, args }) => {
    const data = mesa.phone.queue.remove(args.id);
    return { data, text: `removed ${data.id}` };
  },
});
