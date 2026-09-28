import { MesaError, presentSessions, sessionLabel } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

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

export const boardMove = defineCommand({
  name: 'board move',
  summary: 'Move a managed session up or down within its Board group',
  args: ['id', 'direction'],
  example: 'mesa board move a1b2c3d4 up',
  run: async ({ mesa, args }) => {
    if (args.direction !== 'up' && args.direction !== 'down') {
      throw new MesaError('usage', 'direction must be up or down');
    }
    const recorded = await mesa.sessions.moveOnBoard(args.id, args.direction === 'up' ? -1 : 1);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `moved ${args.id} ${args.direction} on Board`,
    });
  },
});
