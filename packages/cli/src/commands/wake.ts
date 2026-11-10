import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const wake = defineCommand({
  name: 'wake',
  summary: 'Wake a sleeping session: its conversation reopens in the same session and worktree',
  args: ['session'],
  example: 'mesa wake a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.wake(args.session);
    const { record } = recorded.result;
    return recordedOutput(recorded, { data: record, text: `woke ${record.id}` });
  },
});
