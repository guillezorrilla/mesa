import type { Gate } from '@mesa/core';
import { defineCommand } from '../command.js';
import { commaList } from '../input/flags.js';

const line = (g: Gate) => `${g.id}  ${g.task}  ${g.question}  [${g.options.join(', ')}]`;

export const gates = defineCommand({
  name: 'gates',
  summary: 'List the open decision gates, oldest first; only a person resolves one',
  flags: { task: { type: 'string', description: "Only this task's gates" } },
  example: 'mesa gates --task t-1a2b3c4d',
  run: ({ mesa, flags }) => {
    const data = mesa.gates.list(flags.task);
    return { data, text: data.gates.length ? data.gates.map(line).join('\n') : 'no open gates' };
  },
});

export const gatesCreate = defineCommand({
  name: 'gates create',
  summary:
    'Put a decision only a person may make on a task: it reads blocked until they pick an option, and its coordinator gets the answer as a report',
  args: ['question'],
  flags: {
    task: { type: 'string', required: true, description: 'The task that waits on the decision' },
    options: {
      type: 'string',
      required: true,
      description: 'Two to eight distinct options, comma separated',
    },
  },
  example:
    'mesa gates create --task t-1a2b3c4d "Store tide heights in metres or feet?" --options metres,feet',
  run: ({ mesa, args, flags }) => {
    const gate = mesa.gates.create(flags.task, args.question, commaList(flags.options));
    return { data: gate, text: `${gate.id} open on ${gate.task}` };
  },
});

export const gatesResolve = defineCommand({
  name: 'gates resolve',
  summary:
    "Resolve a decision gate with one of its options; a person's command, refused inside a Mesa window",
  args: ['id', 'option'],
  example: 'mesa gates resolve g-1a2b3c4d metres',
  run: ({ mesa, args }) => {
    const gate = mesa.gates.resolve(args.id, args.option);
    return { data: gate, text: `${gate.id} resolved: ${gate.option}` };
  },
});
