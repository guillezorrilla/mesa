import { defineCommand } from '../command.js';

export const rewind = defineCommand({
  name: 'rewind',
  summary: 'Show the last seven local days of meaningful notes, session outcomes, and usage',
  example: 'mesa rewind',
  run: async ({ mesa }) => {
    const report = await mesa.rewind.week();
    return {
      data: report,
      text: [
        `${report.from} to ${report.through} (${report.timezone})`,
        ...report.notes.map((note) => `${note.kind}: ${note.summary} [${note.path}]`),
        ...report.sessions.map((session) => `${session.id}: ${session.name} ${session.state}`),
        `Usage: ${report.usage.input ?? '?'} input, ${report.usage.output ?? '?'} output, ${report.usage.estimatedCostUsd === null ? 'cost unknown' : `$${report.usage.estimatedCostUsd.toFixed(4)} estimated cost`}`,
        ...report.missing.map((item) => `Missing: ${item}`),
      ].join('\n'),
    };
  },
});
