import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const forceStart = defineCommand({
  name: 'force-start',
  summary: 'Start a queued session now, without waiting for its dependency',
  args: ['session'],
  example: 'mesa force-start a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.forceStart(args.session);
    return recordedOutput(recorded, { data: recorded.result, text: recorded.result.id });
  },
});
