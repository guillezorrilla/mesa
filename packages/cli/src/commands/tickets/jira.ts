import { defineCommand } from '../../command.js';
import { VIEW_FLAGS } from '../../input/flags.js';

const { site } = VIEW_FLAGS;
const search = { type: 'string', description: 'Only those whose name holds this' } as const;

export const ticketsBoards = defineCommand({
  name: 'tickets boards',
  summary: 'List the Jira boards a view can follow',
  flags: { search, site },
  example: 'mesa tickets boards --search tide',
  run: async ({ mesa, flags }) => {
    const data = await mesa.tickets.boards(flags.search, flags.site);
    const lines = data.boards.map(
      (b) => `${b.id}  ${b.name} (${b.type}${b.project ? `, ${b.project}` : ''})`,
    );
    return { data, text: lines.length ? lines.join('\n') : 'No boards.' };
  },
});

export const ticketsFilters = defineCommand({
  name: 'tickets filters',
  summary: 'List the saved Jira filters a view can follow',
  flags: { search, site },
  example: 'mesa tickets filters --search bugs',
  run: async ({ mesa, flags }) => {
    const data = await mesa.tickets.filters(flags.search, flags.site);
    const lines = data.filters.map((f) => `${f.id}  ${f.name}`);
    return { data, text: lines.length ? lines.join('\n') : 'No saved filters.' };
  },
});
