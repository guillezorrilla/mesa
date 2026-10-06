import { VERSION } from '../../cli.js';
import { defineCommand } from '../../command.js';
import { columns } from '../../output/columns.js';

export const vaultMcp = defineCommand({
  name: 'vault mcp',
  summary:
    'Serve the mesa-vault tools over stdio to the live Mesa session in MESA_SESSION_ID; outside one, no tools',
  flags: {
    tools: { type: 'boolean', description: 'Print the tool definitions instead of serving them' },
  },
  example: 'mesa vault mcp --tools',
  run: ({ mesa, flags }) => {
    if (!flags.tools) return { data: null, text: '', serve: (io) => mesa.vault.mcp(io, VERSION) };
    const tools = mesa.vault.tools();
    return { data: { tools }, text: columns(tools.map((t) => [t.name, t.description])).join('\n') };
  },
});
