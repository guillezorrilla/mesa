import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const projects = defineCommand({
  name: 'projects',
  summary: 'List the projects registered with this profile',
  example: 'mesa projects',
  run: ({ mesa }) => {
    const rows = mesa.projects.list();
    const text = rows.length
      ? columns(
          rows.map((p) => [p.name, p.path, p.agent, p.priority, p.exists ? '' : '(missing)']),
        ).join('\n')
      : 'no projects registered; run mesa register <path>';
    return { data: rows, text };
  },
});
