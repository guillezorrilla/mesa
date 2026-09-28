import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const history = defineCommand({
  name: 'history',
  summary: 'List native Claude Code and Codex conversations for a project, newest first',
  args: ['project'],
  example: 'mesa history lantern-cove',
  run: async ({ mesa, args }) => {
    const result = mesa.sessions.history(args.project);
    const rows = columns(
      result.rows.map((row) => [
        row.id,
        row.agent,
        row.cwd,
        row.importedAs ? `imported as ${row.importedAs}` : row.heldElsewhere ? 'other profile' : '',
      ]),
    );
    return {
      data: result,
      text: [
        rows.length ? rows.join('\n') : 'no native conversations in this project',
        result.total > result.rows.length
          ? `showing newest ${result.rows.length} of ${result.total}`
          : '',
        ...result.unsupported.map((item) => `${item.agent} history unavailable: ${item.reason}`),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  },
});
