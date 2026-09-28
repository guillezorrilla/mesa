import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const unarchive = defineCommand({
  name: 'unarchive',
  summary: 'Show an archived session in history again without restarting it',
  args: ['session'],
  example: 'mesa unarchive a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = mesa.sessions.unarchive(args.session);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `unarchived ${recorded.result.id}`,
    });
  },
});
