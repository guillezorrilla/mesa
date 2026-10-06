import { defineCommand } from '../../command.js';

export const vaultHealth = defineCommand({
  name: 'vault health',
  summary: 'Report vault navigation and metadata findings without changing files',
  example: 'mesa vault health',
  run: ({ mesa }) => {
    const report = mesa.vault.health();
    return {
      data: report,
      text: [
        `${report.findings.length} findings in ${report.checked} checked Markdown files`,
        ...report.findings.map(
          (finding) =>
            `${finding.path}${finding.line ? `:${finding.line}` : ''} [${finding.kind}] ${finding.message}`,
        ),
        ...report.limitations,
      ].join('\n'),
    };
  },
});
