import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

export const resume = defineCommand({
  name: 'resume',
  summary: "Reopen a session's conversation in a new window, as a new session",
  args: ['session'],
  example: 'mesa resume a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.resume(args.session);
    const { record } = recorded.result;
    const { receipt, text } = withReceipt(recorded, record.id);
    return { data: { ...record, ...receipt }, text };
  },
});
