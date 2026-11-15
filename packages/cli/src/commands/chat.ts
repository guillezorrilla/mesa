import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';

export const chat = defineCommand({
  name: 'chat',
  summary: "Print a session's chat: the person's prompts and its agent's replies, oldest first",
  args: ['session'],
  flags: {
    count: { type: 'string', description: 'How many of the newest replies, 20 by default' },
  },
  example: 'mesa chat a1b2c3d4 --count 5',
  run: ({ mesa, args, flags }) => {
    const count = flags.count === undefined ? undefined : wholeNumber(flags.count, '--count');
    const data = mesa.sessions.chat(args.session, count);
    if (data.unavailable) return { data, text: data.unavailable };
    const said = data.messages.map(
      (message) =>
        `${{ you: 'You', agent: 'Agent', steps: 'Steps' }[message.from]}:\n${message.text}`,
    );
    return {
      data,
      text: [...(data.more ? ['(older replies: --count to see more)'] : []), ...said].join('\n\n'),
    };
  },
});
