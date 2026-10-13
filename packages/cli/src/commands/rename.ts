import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const rename = defineCommand({
  name: 'rename',
  summary: 'Give a session a name; sessions and the Board show it in place of the id',
  args: ['session', 'name?'],
  flags: {
    auto: {
      type: 'boolean',
      description: 'Name it from what you asked it, with Claude Haiku, when no one has named it',
    },
  },
  example: 'mesa rename a1b2c3d4 "tide tables"',
  run: async ({ mesa, args, flags }) => {
    const { name } = args;
    if (Boolean(flags.auto) === (name !== undefined))
      throw new MesaError('usage', 'pass either a name or --auto');
    if (name === undefined) {
      const recorded = await mesa.sessions.autoName(args.session);
      const r = recorded.result;
      const shown = r.name || r.agentName;
      return recordedOutput(recorded, {
        data: r,
        text: shown ? `${r.id} is ${shown}` : `${r.id} has nothing to be named from yet`,
      });
    }
    const recorded = mesa.sessions.rename(args.session, name);
    const r = recorded.result;
    return recordedOutput(recorded, { data: r, text: `renamed ${r.id} to ${r.name}` });
  },
});
