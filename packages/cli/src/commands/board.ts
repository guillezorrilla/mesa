import { presentSessions, sessionLabel } from '@mesa/core';
import { defineCommand } from '../command.js';

export const board = defineCommand({
  name: 'board',
  summary: 'Show sessions grouped and ordered by the profile Board settings',
  example: 'mesa board',
  run: async ({ mesa }) => {
    const preferences = mesa.config.get().board;
    const groups = presentSessions(await mesa.sessions.tree(), preferences);
    return {
      data: { preferences, groups },
      text: groups
        .map((group) =>
          [
            group.label,
            ...group.rows.map(
              (row) =>
                `  ${sessionLabel(row)}  ${row.project ?? '-'}  ${row.managed ? (row.workflowStatus ?? 'unassigned') : 'not managed'}  ${row.lastState.state}`,
            ),
          ].join('\n'),
        )
        .join('\n'),
    };
  },
});
