import { defineCommand } from '../command.js';
import { columns, duration } from '../format.js';

export const sessions = defineCommand({
  name: 'sessions',
  summary:
    'List the sessions (and agent sessions Mesa did not start) by attention: state, confidence, attention, running time, last output',
  flags: {
    all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' },
    tree: {
      type: 'boolean',
      description: 'Children under their parent, indented; --json adds each row its depth',
    },
  },
  example: 'mesa sessions --tree',
  run: async ({ mesa, flags }) => {
    const all = flags.all ?? false;
    const rows = flags.tree ? await mesa.sessions.tree(all) : await mesa.sessions.list(all);
    // Only --tree rows carry a depth.
    const indent = (s: object) =>
      '  '.repeat('depth' in s && typeof s.depth === 'number' ? s.depth : 0);
    const text = rows.length
      ? columns(
          rows.map((s) => [
            `${indent(s)}${s.id}`,
            s.project ?? '-',
            s.agent,
            s.lastState.state,
            `${Math.round(s.lastState.confidence * 100)}%`,
            s.attention.toFixed(2),
            duration(s.runningSeconds),
            s.managed ? (s.lastOutput ?? '') : 'not managed by mesa',
          ]),
        ).join('\n')
      : 'no sessions; run mesa open <project>';
    return { data: rows, text };
  },
});
