import { defineCommand } from '../command.js';

/**
 * The Shared MCP server (ADR-0031): every session's mesa-vault and mesa-decisions on one socket,
 * each connection served by `vault mcp` or `decisions mcp` run in this process with its binding.
 */
export const mcpServe = defineCommand({
  name: 'mcp serve',
  summary:
    "Serve every session's mesa-vault and mesa-decisions on the profile's socket until 10 minutes pass with no connection (started by a session's start)",
  example: 'mesa mcp serve',
  serves: () => true,
  run: async ({ mesa, rerun }) => ({
    data: null,
    text: '',
    serve: (io) =>
      mesa.mcp.serve(async (argv, env, conn) => {
        const ran = await rerun(argv, '', { env, serves: true });
        if (ran.serve) await ran.serve(conn);
        else conn.log(ran.stderr);
      }, io.log),
  }),
});
