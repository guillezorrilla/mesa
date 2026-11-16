import { followedSession, plainText } from '@mesa/core';
import { defineCommand, type ServeIo } from '../command.js';
import { wholeNumber } from '../input/flags.js';

/**
 * One request on a follow's stdin, `{"type":"run","id":…,"argv":[…]}`: one of the chat's actions
 * for the followed session (followedSession), run in this process (no new mesa), its envelope
 * printed back as `{"type":"reply","id":…,"reply":…}`, always. Another line is ignored.
 */
async function runRequest(line: string, session: string, io: ServeIo) {
  let request: { type?: unknown; id?: unknown; argv?: unknown };
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  const { id, argv } = request;
  if (request.type !== 'run' || typeof id !== 'string' || !Array.isArray(argv)) return;
  const words = argv.map(String);
  // Always a reply, so the app never waits on one that cannot come.
  let reply: unknown;
  try {
    reply =
      followedSession(words) === session
        ? JSON.parse(await io.run(['--json', ...words]))
        : {
            ok: false,
            error: {
              code: 'usage',
              message: `a chat's follow runs only ${session}'s chat actions`,
            },
          };
  } catch (failed) {
    reply = { ok: false, error: { code: 'internal', message: String(failed) } };
  }
  io.write(`${JSON.stringify({ type: 'reply', id, reply })}\n`);
}

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
        "Then follow a Structured session: one JSON line per new or changed item, and the prompt its agent waits on as it comes and goes, until stdin closes or it ends; a JSON line on stdin runs one of the chat's actions for it in this process",
    },
  },
  example: 'mesa chat a1b2c3d4 --count 5',
  serves: (flags) => Boolean(flags.follow),
  run: ({ mesa, args, flags }) => {
    const count = flags.count === undefined ? undefined : wholeNumber(flags.count, '--count');
    if (flags.follow)
      return {
        data: null,
        text: '',
        serve: async (io) => {
          // The reader leaves by closing stdin; until then each line is a request to answer.
          let open = true;
          void (async () => {
            for await (const line of io.lines) void runRequest(line, args.session, io);
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
