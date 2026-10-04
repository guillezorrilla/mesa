import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const fork = defineCommand({
  name: 'fork',
  summary: 'Fork a native conversation into a new session, optionally in a worktree',
  args: ['session'],
  flags: {
    branch: {
      type: 'string',
      description:
        'Run the fork in a separate worktree on this branch; a session across projects gets one in each, and needs it',
    },
    base: { type: 'string', description: 'Start a new branch from this ref' },
  },
  example: 'mesa fork a1b2c3d4 --branch try/fork',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.fork(args.session, {
      branch: flags.branch,
      base: flags.base,
    });
    return recordedOutput(recorded, { data: recorded.result, text: recorded.result.id });
  },
});
