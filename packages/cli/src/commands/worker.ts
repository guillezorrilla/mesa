import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

/** A coordinating agent's one command for a worker: a briefed child in its own worktree. */
export const worker = defineCommand({
  name: 'worker',
  summary:
    'Start a worker: a child of this session in its own worktree, with the task as its goal and the worker brief',
  args: ['project', 'task'],
  flags: {
    agent: {
      type: 'string',
      description: 'claude or codex; default: the project, else the profile',
    },
    branch: {
      type: 'string',
      description: 'Its worktree on this branch; default: a new one Mesa names, session/<words>',
    },
    parent: {
      type: 'string',
      description: 'The session it reports to; default: the one whose Mesa window runs this',
    },
  },
  example: 'mesa worker lantern-cove "Parse the tide tables into JSON; add tests"',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.worker(args.project, args.task, {
      agent: flags.agent,
      branch: flags.branch,
      parent: flags.parent,
    });
    return recordedOutput(recorded, { data: recorded.result, text: recorded.result.id });
  },
});
