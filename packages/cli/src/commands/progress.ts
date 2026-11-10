import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';

/** An agent's one line on what it is doing now, shown on its card (CONTEXT.md, Progress line). */
export const progress = defineCommand({
  name: 'progress',
  summary: "Set the one-line progress line on this session's card, or clear it",
  args: ['text?'],
  flags: {
    session: {
      type: 'string',
      description: 'The session; default: the one whose Mesa window runs this',
    },
    clear: { type: 'boolean', description: 'Remove the line' },
  },
  example: 'mesa progress "Running the tide-table tests"',
  run: ({ mesa, args, flags }) => {
    if (Boolean(flags.clear) === (args.text !== undefined))
      throw new MesaError('usage', 'pass either the text or --clear');
    const r = mesa.sessions.progress(args.text, flags.session);
    return { data: r, text: `session ${r.id} progress: ${r.progress?.text ?? 'cleared'}` };
  },
});
