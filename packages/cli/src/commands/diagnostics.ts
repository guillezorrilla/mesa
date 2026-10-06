import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
import { columns } from '../output/columns.js';

export const diagnostics = defineCommand({
  name: 'diagnostics',
  summary: 'Show bounded local hook event metadata for Doctor',
  flags: {
    session: { type: 'string', description: 'Only one Mesa session' },
    agent: { type: 'string', description: 'Only this agent' },
    event: { type: 'string', description: 'Event name contains this text' },
    limit: { type: 'string', description: 'Latest events, 1-200 (default 100)' },
  },
  example: 'mesa diagnostics --event Permission --limit 20',
  run: ({ mesa, flags }) => {
    const data = mesa.diagnostics.list({
      session: flags.session,
      agent: flags.agent,
      event: flags.event,
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
    });
    return {
      data,
      text:
        columns(data.events.map((item) => [item.at, item.session, item.agent, item.event])).join(
          '\n',
        ) || 'no local hook events match',
    };
  },
});
