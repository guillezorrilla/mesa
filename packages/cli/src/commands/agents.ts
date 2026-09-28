import { AGENT_NAMES, agentCapabilityReport } from '@mesa/core';
import { defineCommand } from '../command.js';

export const agents = defineCommand({
  name: 'agents',
  summary: 'Show qualified native agent operations and unsupported capabilities',
  example: 'mesa agents',
  run: async ({ mesa }) => {
    const capabilities = agentCapabilityReport((await mesa.doctor()).checks);
    return {
      data: capabilities,
      text: AGENT_NAMES.map((name) => {
        const row = capabilities[name];
        const operations = Object.entries(row)
          .filter(
            (entry) =>
              typeof entry[1] === 'boolean' &&
              !['installed', 'matchesVerifiedVersion'].includes(entry[0]),
          )
          .map(([operation, value]) => `${operation}=${value}`)
          .join(' ');
        return `${name}: ${row.installed ? (row.version ?? 'installed') : 'missing'}; qualified on ${row.verifiedVersion}${row.matchesVerifiedVersion ? '' : '; current version unverified'}: ${operations}`;
      }).join('\n'),
    };
  },
});
