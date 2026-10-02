import { defineCommand } from '../command.js';

/**
 * Run by Claude Code as the status line of a Mesa session (config sessions.statusLineCost), never
 * by hand: the user's own status line with the session's estimated cost at its end.
 */
export const statusline = defineCommand({
  name: 'statusline',
  summary:
    "Print Claude's status line with the Mesa session's estimated cost (run by Claude in Mesa sessions)",
  example: 'mesa statusline < status.json',
  run: async ({ mesa, stdin }) => {
    const status = await mesa.statusLine.line(await stdin());
    return { data: status, text: status.line };
  },
});
