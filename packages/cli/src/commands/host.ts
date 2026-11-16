import { defineCommand } from '../command.js';

/** The process a Structured session's window runs (ADR-0029); Mesa starts it, a person need not. */
export const host = defineCommand({
  name: 'host',
  summary:
    "Run a Structured session's agent in this window: stream-json, journalled, with its socket open to Mesa",
  args: ['session'],
  example: 'mesa host a1b2c3d4',
  serves: () => true,
  run: async ({ mesa, args }) => {
    // Started here, so a refusal (one host and one claude per conversation) is the command's error.
    // Its status until the window's stdout is served, then straight to it.
    let last = '';
    let write = (text: string) => {
      last = text;
    };
    const running = await mesa.sessions.host(args.session, (text) => write(text));
    return {
      data: null,
      text: '',
      serve: async (io) => {
        write = io.write;
        write(last);
        await running.done;
      },
    };
  },
});
