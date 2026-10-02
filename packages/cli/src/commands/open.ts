import { MesaError } from '@mesa/core';
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
    from: {
      type: 'string',
      description:
        'Start from an imported item (its id or link; a link not imported yet is imported first): the goal names its title, URL, and vault paths, then --goal',
    },
    'no-notes': {
      type: 'boolean',
      description: 'With --from, import a new item with no import-notes run',
    },
    'exact-goal': {
      type: 'boolean',
      description: "With --from, --goal is the whole goal, in place of the item's",
    },
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
    checkout: {
      type: 'string',
      description:
        'Run it in this existing linked worktree of the project (a detached one gets a new branch)',
    },
    worktree: {
      type: 'boolean',
      description:
        'Run it in its own git worktree on a new branch Mesa names: session/<words>-<4 characters>',
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
    if (flags.from === undefined && (flags['no-notes'] || flags['exact-goal'])) {
      throw new MesaError('usage', '--no-notes and --exact-goal need --from');
    }
    const options = {
      agent: flags.agent,
      mode: flags.mode,
      background: flags.background,
      goal: flags.goal,
      goalFile: flags['goal-file'],
      parent: flags.parent,
      noParent: flags['no-parent'],
      after: flags.after,
      branch: flags.branch,
      worktree: flags.worktree,
      checkout: flags.checkout,
      base: flags.base,
      terminal: flags.terminal,
      general: flags.general,
    };
    const recorded =
      flags.from === undefined
        ? await mesa.sessions.open(args.project, options)
        : await mesa.imports.open(args.project, {
            ...options,
            from: flags.from,
            notes: !flags['no-notes'],
            exactGoal: flags['exact-goal'],
          });
    const session = recorded.result;
    const exec = flags.attach ? (await mesa.sessions.attach(session.id)).exec : undefined;
    return { ...recordedOutput(recorded, { data: session, text: session.id }), exec };
  },
});
