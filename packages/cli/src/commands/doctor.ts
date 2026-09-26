import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

const MARK = { ok: 'ok', warn: 'warn', fail: 'FAIL' } as const;

export const doctor = defineCommand({
  name: 'doctor',
  summary: 'Check tmux, the agents, Obsidian, and the profile directory',
  example: 'mesa doctor',
  run: async ({ mesa }) => {
    const report = await mesa.doctor();
    // Path and hint share the last column, which is never padded.
    const lines = columns(
      report.checks.map((c) => [
        MARK[c.status],
        c.name,
        c.version,
        [c.path, c.hint].filter(Boolean).join('  '),
      ]),
    );
    if (!report.healthy) lines.push(`doctor: ${report.summary}`);
    return {
      data: report,
      text: lines.join('\n'),
      code: report.healthy ? 0 : EXIT_CODES.not_found,
    };
  },
});
