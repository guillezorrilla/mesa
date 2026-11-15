import { plainText } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';

export const chat = defineCommand({
  name: 'chat',
  summary:
    "Print a session's chat: the person's prompts and slash commands and its agent's replies, oldest first",
  args: ['session'],
  flags: {
    count: { type: 'string', description: 'How many of the newest replies, 20 by default' },
    follow: {
      type: 'boolean',
      description:
        'Then follow a Structured session: one JSON line per new or changed item, until stdin closes or it ends',
    },
  },
  example: 'mesa chat a1b2c3d4 --count 5',
  run: ({ mesa, args, flags }) => {
    const count = flags.count === undefined ? undefined : wholeNumber(flags.count, '--count');
    if (flags.follow)
      return {
        data: null,
        text: '',
        serve: async (io) => {
          // The reader leaves by closing stdin.
          let open = true;
          void (async () => {
            for await (const _ of io.lines);
            open = false;
          })();
          await mesa.sessions.chatFollow(
            args.session,
            (line) => io.write(`${JSON.stringify(line)}\n`),
            () => open,
            count,
          );
        },
      };
    const data = mesa.sessions.chat(args.session, count);
    if (data.unavailable) return { data, text: data.unavailable };
    const said = data.messages.map((message) => {
      if (message.from !== 'command')
        return `${{ you: 'You', agent: 'Agent', steps: 'Steps' }[message.from]}:\n${message.text}`;
      const { text, output } = message;
      return output ? `Command: ${text}\n${plainText(output)}` : `Command: ${text}`;
    });
    return {
      data,
      text: [...(data.more ? ['(older replies: --count to see more)'] : []), ...said].join('\n\n'),
    };
  },
});
