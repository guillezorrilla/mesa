import { defineCommand } from '../command.js';
import { bulkExit } from '../output/bulk.js';
import { recordedOutput } from '../output/recorded.js';

export const archive = defineCommand({
  name: 'archive',
  summary:
    'End sessions and hide them from the active board, keeping their records and logs; an unknown id archives none, and it exits 2 when any item failed',
  args: ['session', 'more...'],
  example: 'mesa archive a1b2c3d4',
  run: async ({ mesa, args }) => {
    if (args.more.length > 0) {
      const data = await mesa.sessions.archiveEach([args.session, ...args.more]);
      return {
        data,
        text: data.items
          .map((item) => `${item.id}: ${item.ok ? 'archived' : item.error.message}`)
          .join('\n'),
        code: bulkExit(data.items.some((item) => !item.ok)),
      };
    }
    const recorded = await mesa.sessions.archive(args.session);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `archived ${recorded.result.id}`,
    });
  },
});
