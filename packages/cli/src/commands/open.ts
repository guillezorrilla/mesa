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
    goal: {
      type: 'string',
      description: "The agent's first prompt; one starting /goal runs Claude Code's goal command",
    },
    'goal-file': { type: 'string', description: 'Read the goal from this file (UTF-8)' },
    parent: {
      type: 'string',
      description: 'The session this one is started from; default: the Mesa window this runs in',
    },
    'no-parent': { type: 'boolean', description: 'Start it with no parent, even inside a session' },
  },
  example: 'mesa open lantern-cove --goal "Read AGENTS.md, then summarise it"',
  run: async ({ mesa, args, flags, tty }) => {
    // Checked first, so a session is never opened that this terminal cannot then attach to.
    if (flags.attach) requireTty(tty);
    const recorded = await mesa.sessions.open(args.project, {
      agent: flags.agent,
      goal: flags.goal,
      goalFile: flags['goal-file'],
      parent: flags.parent,
      noParent: flags['no-parent'],
    });
    const session = recorded.result;
    const { receipt, text } = withReceipt(recorded, session.id);
    const exec = flags.attach ? (await mesa.sessions.attach(session.id)).exec : undefined;
    return { data: { ...session, ...receipt }, text, exec };
  },
});
