import { defineCommand } from '../command.js';
import { listenCommands } from '../command-socket.js';
import { serveCommands } from '../serve.js';
import { VERSION } from '../version.js';

/**
 * The Command server the app sends its commands to (ADR-0030); the app starts it, a person need
 * not. While it serves, it answers `mesa` starts on the profile's Command socket too (ADR-0032).
 */
export const serve = defineCommand({
  name: 'serve',
  summary:
    "Serve the app's commands on stdin and stdout, one JSON request and one reply a line (started by the app)",
  example: `printf '%s\\n' '{"id":1,"args":["--json","sessions"]}' | mesa serve`,
  serves: () => true,
  run: async ({ mesa, rerun }) => ({
    data: null,
    text: '',
    serve: async (io) => {
      const socket = await listenCommands(mesa.commandSocket(), VERSION, rerun).catch(
        (error: unknown) => {
          // Calls still come on stdio; a `mesa` start then runs in its own process.
          io.log(
            `mesa serve: no Command socket: ${error instanceof Error ? error.message : error}\n`,
          );
          return undefined;
        },
      );
      try {
        await serveCommands(io, rerun);
      } finally {
        await socket?.close();
      }
    },
  }),
});
