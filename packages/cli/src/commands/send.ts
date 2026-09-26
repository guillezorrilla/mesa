import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

export const send = defineCommand({
  name: 'send',
  summary: "Type a prompt into a session's agent, then Enter",
  args: ['session', 'prompt'],
  flags: {
    force: { type: 'boolean', description: 'Send even when the pane runs a shell, not the agent' },
    from: {
      type: 'string',
      description:
        'The session it is from, named in a header with how to reply; default: this window',
    },
  },
  example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.send(args.session, args.prompt, {
      force: flags.force,
      from: flags.from,
    });
    const { sent, session, from, chars } = recorded.result;
    const said = `sent ${chars} characters to ${session}${from ? ` from ${from}` : ''}`;
    const { receipt, text } = withReceipt(recorded, said);
    return { data: { sent, session, from, chars, ...receipt }, text };
  },
});
