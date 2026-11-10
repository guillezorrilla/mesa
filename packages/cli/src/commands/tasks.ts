import type { Task } from '@mesa/core';
import { defineCommand } from '../command.js';
import { commaList } from '../input/flags.js';

const line = (t: Task) => `${t.id}  ${t.graph}  ${t.state}  ${t.spec.split('\n')[0]}`;

export const tasks = defineCommand({
  name: 'tasks',
  summary:
    'List the planned tasks, oldest first, with their graph and state; --ready only those ready to start',
  flags: {
    graph: { type: 'string', description: 'Only this task graph' },
    ready: { type: 'boolean', description: 'Only tasks ready to start: every dep succeeded' },
  },
  example: 'mesa tasks --graph tides --ready',
  run: ({ mesa, flags }) => {
    const data = mesa.tasks.list({ graph: flags.graph, ready: flags.ready });
    return { data, text: data.tasks.length ? data.tasks.map(line).join('\n') : 'no tasks' };
  },
});

export const tasksCreate = defineCommand({
  name: 'tasks create',
  summary:
    'Plan a task in a task graph: ready when it has no deps or all succeeded, else pending; its coordinator is your session, or --coordinator',
  args: ['spec'],
  flags: {
    graph: { type: 'string', description: 'The task graph it belongs to (default: default)' },
    deps: {
      type: 'string',
      description: 'The tasks it waits on, comma separated; each must exist',
    },
    coordinator: { type: 'string', description: 'The session that plans it, in place of yours' },
  },
  example: 'mesa tasks create "Draw the tide chart" --graph tides --deps t-1a2b3c4d',
  run: ({ mesa, args, flags }) => {
    const made = mesa.tasks.create(args.spec, {
      graph: flags.graph,
      deps: flags.deps === undefined ? undefined : commaList(flags.deps),
      coordinator: flags.coordinator,
    });
    return { data: made, text: `${made.id} ${made.state}` };
  },
});

export const tasksShow = defineCommand({
  name: 'tasks show',
  summary: "One task, with each task it waits on and that one's state",
  args: ['id'],
  example: 'mesa tasks show t-1a2b3c4d',
  run: ({ mesa, args }) => {
    const shown = mesa.tasks.show(args.id);
    return {
      data: shown,
      text: [
        line(shown),
        ...shown.dependencies.map((d) => `  waits on ${d.id} ${d.state}  ${d.spec.split('\n')[0]}`),
      ].join('\n'),
    };
  },
});
