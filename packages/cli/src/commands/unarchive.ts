import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const unarchive = defineCommand({
  name: 'unarchive',
  summary:
    'Show an archived session in history again without restarting it; with --resume, reopen its conversation as a new session too (one with none to resume stays ended, with a warning)',
  args: ['session'],
  flags: {
    resume: {
      type: 'boolean',
      description: 'Also resume it, as mesa resume does; --json names the new session as resumed',
    },
  },
  example: 'mesa unarchive --resume a1b2c3d4',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.unarchive(args.session, { resume: flags.resume ?? false });
    const { id, resumed } = recorded.result;
    return recordedOutput(recorded, {
      data: recorded.result,
      text: resumed ? `unarchived ${id}, resumed as ${resumed.id}` : `unarchived ${id}`,
    });
  },
});
