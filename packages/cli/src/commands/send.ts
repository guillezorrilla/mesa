import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

export const send = defineCommand({
  name: 'send',
  summary: "Type a prompt into a session's agent, then Enter",
  args: ['session', 'prompt'],
  flags: {
    force: { type: 'boolean', description: 'Send even when the pane runs a shell, not the agent' },
  },
  example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.send(args.session, args.prompt, flags.force ?? false);
    const { sent, session, chars } = recorded.result;
    const { receipt, text } = withReceipt(recorded, `sent ${chars} characters to ${session}`);
    return { data: { sent, session, chars, ...receipt }, text };
  },
});
