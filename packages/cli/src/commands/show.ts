import { agentShown } from '@mesa/core';
import { stringify } from 'yaml';
import { defineCommand } from '../command.js';

export const show = defineCommand({
  name: 'show',
  summary: "Print one session's record, and whether it is alive",
  args: ['session'],
  flags: {
    full: {
      type: 'boolean',
      description:
        "With --json inside a session's window, the instruction hook, vault and decisions details, not only their state",
    },
  },
  example: 'mesa show a1b2c3d4',
  run: async ({ mesa, args, flags }) => {
    const shown = await mesa.sessions.show(args.session);
    // An agent in a session's window reads each status as its state (agent-view.ts).
    const data = !flags.full && mesa.sessions.agentReads() ? agentShown(shown) : shown;
    return { data, text: stringify(shown).trimEnd() };
  },
});
