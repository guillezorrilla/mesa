import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const archive = defineCommand({
  name: 'archive',
  summary: 'End a session and hide it from the active board, keeping its record and logs',
  args: ['session'],
  example: 'mesa archive a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.archive(args.session);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `archived ${recorded.result.id}`,
    });
  },
});
