import { agentRecord, MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { MODEL_FLAGS, SESSION_VIEW_FLAG } from '../input/flags.js';
import { recordedOutput } from '../output/recorded.js';

/** A coordinating agent's one command for a worker: a briefed child in its own worktree. */
export const worker = defineCommand({
  name: 'worker',
  summary:
    'Start a worker: a child of this session in its own worktree, with the task as its goal and the worker brief',
  args: ['project', 'task?'],
  flags: {
    task: {
      type: 'string',
      description:
        "Start this ready task (mesa tasks) in place of a task text: its spec is the goal, and the worker's done or failed report settles it",
    },
    agent: {
      type: 'string',
      description: 'claude or codex; default: the project, else the profile',
    },
    ...MODEL_FLAGS,
    ...SESSION_VIEW_FLAG,
    branch: {
      type: 'string',
      description: 'Its worktree on this branch; default: a new one Mesa names, session/<words>',
    },
    parent: {
      type: 'string',
      description: 'The session it reports to; default: the one whose Mesa window runs this',
    },
  },
  example: 'mesa worker lantern-cove "Rename tideTable to tideChart; fix the tests" --model sonnet',
  run: async ({ mesa, args, flags }) => {
    // The coordinator just typed the task: its goal does not come back to be reread each turn.
    const agentReads = mesa.sessions.agentReads();
    const how = {
      agent: flags.agent,
      branch: flags.branch,
      parent: flags.parent,
      model: flags.model,
      effort: flags.effort,
      view: flags.view,
    };
    if (flags.task !== undefined) {
      if (args.task !== undefined)
        throw new MesaError('usage', 'pass a task text or --task <id>, not both');
      const started = await mesa.tasks.start(flags.task, args.project, how);
      const { task, worker } = started.result;
      return recordedOutput(started, {
        data: agentReads ? { task, worker: agentRecord(worker) } : started.result,
        text: `${task.id} running in ${worker.id}`,
      });
    }
    if (args.task === undefined)
      throw new MesaError(
        'usage',
        'say what the worker does, or start a planned task with --task <id>',
      );
    const recorded = await mesa.sessions.worker(args.project, args.task, how);
    return recordedOutput(recorded, {
      data: agentReads ? agentRecord(recorded.result) : recorded.result,
      text: recorded.result.id,
    });
  },
});
