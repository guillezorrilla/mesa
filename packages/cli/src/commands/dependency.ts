import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const dependency = defineCommand({
  name: 'dependency',
  summary: 'Set visual parent or change the wait target of a queued session',
  args: ['session'],
  flags: {
    parent: { type: 'string', description: 'Visual parent session ID, or none to clear' },
    after: { type: 'string', description: 'Session to wait for before a queued session starts' },
  },
  example: 'mesa dependency a1b2c3d4 --parent e5f6g7h8',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.dependencies(args.session, {
      parent:
        flags.parent === undefined ? undefined : flags.parent === 'none' ? null : flags.parent,
      after: flags.after,
    });
    return recordedOutput(recorded, { data: recorded.result, text: recorded.result.id });
  },
});
