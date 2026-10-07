import { VERSION } from '../../cli.js';
import { defineCommand } from '../../command.js';
import { columns } from '../../output/columns.js';

export const decisionsMcp = defineCommand({
  name: 'decisions mcp',
  summary:
    'Serve decision_evaluate over stdio to the live Mesa session in MESA_SESSION_ID; outside one, with no Decision model, or turned off, no tools',
  flags: {
    tools: { type: 'boolean', description: 'Print the tool definitions instead of serving them' },
  },
  example: 'mesa decisions mcp --tools',
  run: ({ mesa, flags }) => {
    if (!flags.tools)
      return { data: null, text: '', serve: (io) => mesa.decisions.mcp(io, VERSION) };
    const tools = mesa.decisions.tools();
    return { data: { tools }, text: columns(tools.map((t) => [t.name, t.description])).join('\n') };
  },
});
