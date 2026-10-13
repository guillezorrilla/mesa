import { defineCommand } from '../command.js';

export const diff = defineCommand({
  name: 'diff',
  summary:
    'Show everything a session changed since it left its base branch: commits, edits, and new files',
  args: ['session'],
  example: 'mesa diff a1b2c3d4',
  run: async ({ mesa, args }) => {
    const changes = await mesa.sessions.diff(args.session);
    return {
      data: changes,
      text: `${changes.ahead} commits since ${changes.base}\n${changes.patch}`,
    };
  },
});
