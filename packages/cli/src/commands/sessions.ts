import { defineCommand } from '../command.js';
import { columns, duration } from '../format.js';

export const sessions = defineCommand({
  name: 'sessions',
  summary:
    'List the sessions (and agent sessions Mesa did not start) by attention: state, confidence, attention, running time',
  flags: { all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' } },
  run: async ({ mesa, flags }) => {
    const rows = await mesa.sessions.list(flags.all ?? false);
    const text = rows.length
      ? columns(
          rows.map((s) => [
            s.id,
            s.project ?? '-',
            s.agent,
            s.lastState.state,
            `${Math.round(s.lastState.confidence * 100)}%`,
            s.attention.toFixed(2),
            duration(s.runningSeconds),
            s.managed ? '' : 'not managed by mesa',
          ]),
        ).join('\n')
      : 'no sessions; run mesa open <project>';
    return { data: rows, text };
  },
});
