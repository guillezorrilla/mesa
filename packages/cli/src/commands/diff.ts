import { counted } from '@mesa/core';
import { defineCommand } from '../command.js';

export const diff = defineCommand({
  name: 'diff',
  summary:
    'Show everything a session changed since it left its base branch: commits, edits, and new files',
  args: ['session'],
  flags: {
    base: {
      type: 'string',
      description:
        'Compare with this ref; default: the base its worktree was made from, or the project default once its agent moved to another branch',
    },
  },
  example: 'mesa diff a1b2c3d4 --base origin/develop',
  run: async ({ mesa, args, flags }) => {
    // The rows carry the patch already; --json leaves the raw text out.
    const { patch, ...data } = await mesa.sessions.diff(args.session, flags.base);
    return { data, text: `${counted(data.ahead, 'commit')} since ${data.base}\n${patch}` };
  },
});
