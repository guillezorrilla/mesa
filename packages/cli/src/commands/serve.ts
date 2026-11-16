import { defineCommand } from '../command.js';
import { serveCommands } from '../serve.js';

/** The Command server the app sends its commands to (ADR-0030); the app starts it, a person need not. */
export const serve = defineCommand({
  name: 'serve',
  summary:
    "Serve the app's commands on stdin and stdout, one JSON request and one reply a line (started by the app)",
  example: `printf '%s\\n' '{"id":1,"args":["--json","sessions"]}' | mesa serve`,
  serves: () => true,
  run: async ({ rerun }) => ({ data: null, text: '', serve: (io) => serveCommands(io, rerun) }),
});
