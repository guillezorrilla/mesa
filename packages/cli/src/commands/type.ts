import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const typeLine = defineCommand({
  name: 'type',
  summary:
    'Type a line into a plain terminal session, then Enter, once the guardrail allows it; a person only',
  args: ['session', 'line'],
  flags: {
    force: { type: 'boolean', description: 'Type anyway, past a guardrail block or ask' },
    yes: {
      type: 'boolean',
      description: 'Type past a guardrail ask (a strict project) without asking y/N',
    },
  },
  example: 'mesa type a1b2c3d4 "ls -la"',
  run: async ({ mesa, args, flags, confirm }) => {
    const recorded = await mesa.sessions.terminal.type(args.session, args.line, {
      force: flags.force,
      yes: flags.yes,
      confirm,
    });
    const r = recorded.result;
    return recordedOutput(recorded, {
      data: r,
      text: `typed ${r.chars} characters into ${r.session}`,
    });
  },
});
