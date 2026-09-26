import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const stop = defineCommand({
  name: 'stop',
  summary: 'End a session: its agent is asked to quit (up to 5 s), then its window is closed',
  args: ['session'],
  flags: {
    force: { type: 'boolean', description: 'Close the window at once, without asking the agent' },
  },
  example: 'mesa stop a1b2c3d4',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.stop(args.session, flags.force ?? false);
    const { record, outcome } = recorded.result;
    const said = {
      exited: `stopped ${record.id}`,
      killed: `stopped ${record.id} (window closed)`,
      gone: `stopped ${record.id} (its window was already gone)`,
      'already-ended': `session ${record.id} had already ended`,
    }[outcome];
    return recordedOutput(recorded, { data: { ...record, outcome }, text: said });
  },
});
