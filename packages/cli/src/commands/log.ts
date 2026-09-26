import { defineCommand } from '../command.js';

export const log = defineCommand({
  name: 'log',
  summary: "Append a line to the vault's log.md and today's daily note",
  args: ['text'],
  example: 'mesa log "merged the help reference"',
  run: async ({ mesa, args }) => {
    const { entry, daily } = await mesa.log(args.text);
    return { data: { entry, daily }, text: `logged to log.md and ${daily}` };
  },
});
