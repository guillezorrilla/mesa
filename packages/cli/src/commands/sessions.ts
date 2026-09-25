import { defineCommand } from '../command.js';
import { columns, duration } from '../format.js';

export const sessions = defineCommand({
  name: 'sessions',
  summary: 'List the sessions of this profile, oldest first, with live tmux state',
  flags: { all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' } },
  run: async ({ mesa, flags }) => {
    const rows = await mesa.sessions.list(flags.all ?? false);
    const text = rows.length
      ? columns(
          rows.map((s) => [
            s.id,
            s.project,
            s.agent,
            s.lastState.state,
            duration(s.runningSeconds),
          ]),
        ).join('\n')
      : 'no sessions; run mesa open <project>';
    return { data: rows, text };
  },
});
