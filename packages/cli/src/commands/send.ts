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
        'The session it is from, named in a header with how to reply; default: the Mesa window this runs in',
    },
    'no-from': { type: 'boolean', description: 'Send it as a person, even inside a Mesa window' },
  },
  example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.send(args.session, args.prompt, {
      force: flags.force,
      from: flags.from,
      noFrom: flags['no-from'],
    });
    const { sent, session, from, chars, warning } = recorded.result;
    const warned = warning ? `\nwarning: ${warning}` : '';
    const said = `sent ${chars} characters to ${session}${from ? ` from ${from}` : ''}${warned}`;
    const { receipt, text } = withReceipt(recorded, said);
    return {
      data: { sent, session, from, chars, ...(warning ? { warning } : {}), ...receipt },
      text,
    };
  },
});
