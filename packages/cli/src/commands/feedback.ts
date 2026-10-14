import { defineCommand } from '../command.js';

export const feedback = defineCommand({
  name: 'feedback',
  summary: "Send feedback to Mesa's maker: only the message, your Mesa version and build go",
  args: ['message'],
  flags: {
    from: { type: 'string', description: 'Where it was written: an app screen (default: cli)' },
  },
  example: 'mesa feedback "The board loses my place after a restart"',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.feedback.send({ message: args.message, from: flags.from || 'cli' });
    return { data, text: 'Thanks, feedback sent.' };
  },
});
