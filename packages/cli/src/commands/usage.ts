import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const usage = defineCommand({
  name: 'usage',
  summary: 'Show native provider token usage, with unknown cost left unknown',
  flags: { session: { type: 'string', description: 'Only one Mesa session' } },
  example: 'mesa usage',
  run: async ({ mesa, flags }) => {
    const report = await mesa.usage.list(flags.session);
    return {
      data: report,
      text:
        [
          ...columns(
            report.rows.map((row) => [
              row.at,
              row.session,
              row.agent,
              row.model ?? 'unknown model',
              row.tokens.input ?? '?',
              row.tokens.output ?? '?',
              row.tokens.cacheRead ?? '?',
              row.tokens.cacheWrite ?? '?',
              row.estimatedCostUsd === null ? 'cost unknown' : `$${row.estimatedCostUsd}`,
            ]),
          ),
          ...report.unknown.map((item) => `${item.session}: ${item.reason}`),
          ...report.alerts.map(
            (alert) =>
              `${alert.period} known estimated cost $${alert.knownCostUsd.toFixed(4)} reached the $${alert.thresholdUsd.toFixed(2)} alert`,
          ),
        ].join('\n') || 'no qualified native usage yet',
    };
  },
});
