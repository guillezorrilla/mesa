import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const prsSetup = defineCommand({
  name: 'prs setup',
  summary:
    "Show each project's PR provider (GitHub or Bitbucket) and whether its CLI (gh, twg) is ready",
  example: 'mesa prs setup --json',
  run: async ({ mesa }) => {
    const data = await mesa.prs.setup();
    return {
      data,
      text: columns(
        data.map((r) => [r.project, r.provider ?? 'no PR provider', r.cli, r.state, r.next]),
      ).join('\n'),
    };
  },
});
