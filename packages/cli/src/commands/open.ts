import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

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
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.open(args.project, flags.agent);
    const session = recorded.result;
    const { receipt, text } = withReceipt(recorded, session.id);
    const exec = flags.attach ? mesa.sessions.attachArgv(session) : undefined;
    return { data: { ...session, ...receipt }, text, exec };
  },
});
