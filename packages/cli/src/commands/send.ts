import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const send = defineCommand({
  name: 'send',
  summary: "Type a prompt into a session's agent, then Enter, once the guardrail allows it",
  args: ['session', 'prompt'],
  flags: {
    force: {
      type: 'boolean',
      description:
        'Send anyway: past a guardrail block or ask, a pane that runs a shell, or, as a person, an agent waiting on one',
    },
    yes: {
      type: 'boolean',
      description: 'Send past a guardrail ask (a strict project) without asking y/N',
    },
    from: {
      type: 'string',
      description:
        'The session it is from, named in a header with how to reply; default: the Mesa window this runs in',
    },
    'no-from': { type: 'boolean', description: 'Send it as a person, even inside a Mesa window' },
  },
  example: 'mesa send a1b2c3d4 "run the tests, then summarise the failures"',
  run: async ({ mesa, args, flags, confirm }) => {
    const recorded = await mesa.sessions.send(args.session, args.prompt, {
      force: flags.force,
      yes: flags.yes,
      confirm,
      from: flags.from,
      noFrom: flags['no-from'],
    });
    const { sent, session, from, chars, override } = recorded.result;
    const text = `sent ${chars} characters to ${session}${from ? ` from ${from}` : ''}`;
    const data = { sent, session, from, chars, ...(override ? { override } : {}) };
    return recordedOutput(recorded, { data, text });
  },
});
