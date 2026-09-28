import { defineCommand } from '../command.js';
import { requireTty } from '../guards.js';
import { recordedOutput } from '../output/recorded.js';

export const open = defineCommand({
  name: 'open',
  summary: 'Start an agent session for a project in a new tmux window',
  args: ['project?'],
  flags: {
    general: { type: 'boolean', description: 'Start without a project in the profile home folder' },
    agent: {
      type: 'string',
      description:
        'claude, codex, or antigravity; default: the project mesa.yaml, else the profile default',
    },
    attach: { type: 'boolean', description: 'Attach this terminal to the new window' },
    terminal: { type: 'boolean', description: 'Start a plain shell session with no coding agent' },
    background: { type: 'boolean', description: 'Run Claude in its native background mode' },
    mode: {
      type: 'string',
      description: 'Native startup mode: plan (Claude Code, Antigravity CLI)',
    },
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
    after: {
      type: 'string',
      description:
        'Queue it until this session is over, then start it; its parent by default. At once if it is over',
    },
    branch: {
      type: 'string',
      description:
        'Run it in its own git worktree on this branch, new or existing, under the profile',
    },
    base: {
      type: 'string',
      description:
        'Start a new branch from this ref; default: the branch of that name on origin, else origin/HEAD, else the current branch',
    },
  },
  example: 'mesa open lantern-cove --goal "Read AGENTS.md, then summarise it"',
  run: async ({ mesa, args, flags, tty }) => {
    // Checked first, so a session is never opened that this terminal cannot then attach to.
    if (flags.attach) requireTty(tty, 'mesa attach --app');
    const recorded = await mesa.sessions.open(args.project, {
      agent: flags.agent,
      mode: flags.mode,
      background: flags.background,
      goal: flags.goal,
      goalFile: flags['goal-file'],
      parent: flags.parent,
      noParent: flags['no-parent'],
      after: flags.after,
      branch: flags.branch,
      base: flags.base,
      terminal: flags.terminal,
      general: flags.general,
    });
    const session = recorded.result;
    const exec = flags.attach ? (await mesa.sessions.attach(session.id)).exec : undefined;
    return { ...recordedOutput(recorded, { data: session, text: session.id }), exec };
  },
});
