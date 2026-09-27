import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const workflow = defineCommand({
  name: 'workflow',
  summary: 'Set a session workflow label, separate from its agent state',
  args: ['session', 'status'],
  example: 'mesa workflow a1b2c3d4 review',
  run: ({ mesa, args }) => {
    const recorded = mesa.sessions.workflow(args.session, args.status);
    const r = recorded.result;
    return recordedOutput(recorded, {
      data: r,
      text: `session ${r.id} workflow: ${r.workflowStatus ?? 'unassigned'}`,
    });
  },
});
