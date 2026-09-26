import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';
import { requireTty } from './attach.js';

export const open = defineCommand({
  name: 'open',
  summary: 'Start an agent session for a project in a new tmux window',
  args: ['project'],
  flags: {
    agent: {
      type: 'string',
      description: 'claude (v1); default: the project mesa.yaml, else the profile default',
    },
    attach: { type: 'boolean', description: 'Attach this terminal to the new window' },
  },
  example: 'mesa open lantern-cove',
  run: async ({ mesa, args, flags, tty }) => {
    // Checked first, so a session is never opened that this terminal cannot then attach to.
    if (flags.attach) requireTty(tty);
    const recorded = await mesa.sessions.open(args.project, flags.agent);
    const session = recorded.result;
    const { receipt, text } = withReceipt(recorded, session.id);
    const exec = flags.attach ? (await mesa.sessions.attach(session.id)).exec : undefined;
    return { data: { ...session, ...receipt }, text, exec };
  },
});
