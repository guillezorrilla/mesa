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

export const historySearch = defineCommand({
  name: 'history search',
  summary: 'Search recent native Claude Code and Codex conversation text in a project',
  args: ['project', 'words...'],
  example: 'mesa history search lantern-cove tide',
  run: async ({ mesa, args }) => {
    const result = mesa.sessions.search(args.project, args.words.join(' '));
    return {
      data: result,
      text: [
        result.hits.length
          ? columns(result.hits.map((hit) => [hit.id, hit.agent, hit.role, hit.excerpt])).join('\n')
          : 'no matching conversation text',
        result.truncated ? 'partial results: search bounds reached' : '',
        ...result.unsupported.map((item) => `${item.agent} search unavailable: ${item.reason}`),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  },
});
