import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const swap = defineCommand({
  name: 'swap',
  summary:
    "Swap a fresh session's agent in place: same session and folder, the new agent in a new window; one with a conversation hands off instead",
  args: ['session', 'agent'],
  example: 'mesa swap a1b2c3d4 codex',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.swap(args.session, args.agent);
    const r = recorded.result;
    return recordedOutput(recorded, { data: r, text: `swapped ${r.id} to ${r.agent}` });
  },
});
