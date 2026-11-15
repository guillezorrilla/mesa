import { plainText } from '@mesa/core';
import { defineCommand } from '../command.js';

/** The app's command card asks this about every second while its command's panel is open. */
export const panel = defineCommand({
  name: 'panel',
  summary:
    "Show what a slash command sent to a session shows in its pane now: the agent's panel, or the output under the command; --json keeps its colours",
  args: ['session', 'command'],
  example: 'mesa panel a1b2c3d4 /usage',
  run: async ({ mesa, args }) => {
    const shown = await mesa.sessions.panel(args.session, args.command);
    return { data: shown, text: shown.lines.map(plainText).join('\n') };
  },
});
