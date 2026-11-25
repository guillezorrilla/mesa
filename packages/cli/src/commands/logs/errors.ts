import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { QUERY_FLAGS, queryOf } from '../../input/cloud-flags.js';
import { columns } from '../../output/columns.js';

export const logsErrors = defineCommand({
  name: 'logs errors',
  summary:
    "List the error groups across logs.gcp's projects: Error Reporting's, else errors grouped from the logs, each with count, first and last seen, services and a New / Back again badge",
  flags: QUERY_FLAGS,
  example: 'mesa logs errors --env prod --since 6h',
  run: async ({ mesa, flags }) => {
    const found = await mesa.logs.errors(queryOf(flags));
    return {
      data: found,
      text:
        [
          ...found.warnings.map((w) => `warning: ${w.message}`),
          ...columns(
            found.groups.map((g) => [
              String(g.count),
              g.badge ?? '',
              `${g.project}/${g.services.join(',')}`,
              g.message,
            ]),
          ),
        ].join('\n') || 'no errors',
    };
  },
});

export const logsErrorSamples = defineCommand({
  name: 'logs errors samples',
  summary: 'Print a few recent events of an Error Reporting group, their stacks whole',
  args: ['project', 'group'],
  flags: { since: { type: 'string', description: 'How far back (1h, 6h, 1d, 7d); default 1d' } },
  example: 'mesa logs errors samples tide-tables-123 CLmY0Zq9',
  run: async ({ mesa, args, flags }) => {
    const found = await mesa.logs.errorSamples(args.project, args.group, flags.since);
    return { data: found, text: found.events.map((e) => `${e.time}\n${e.message}`).join('\n\n') };
  },
});

export const logsCounts = defineCommand({
  name: 'logs counts',
  summary: "Print a log-based metric's count per 5 minutes, from Cloud Monitoring",
  flags: {
    project: {
      type: 'string',
      multiple: true,
      description: 'A GCP project the metric is in (repeat for a view spanning several)',
    },
    metric: { type: 'string', required: true, description: 'The log-based metric' },
    since: { type: 'string', description: 'How far back (an age such as 6h); default 1h' },
  },
  example: 'mesa logs counts --project tide-tables-123 --metric checkout-errors --since 6h',
  run: async ({ mesa, flags }) => {
    if (!flags.project?.length)
      throw new MesaError('usage', "name the metric's GCP project: --project <id>");
    const found = await mesa.logs.counts(flags.project, flags.metric, flags.since);
    return {
      data: found,
      text: [
        ...found.warnings.map((w) => `warning: ${w.message}`),
        ...found.counts.map((c) => `${c.start} ${c.count}`),
      ].join('\n'),
    };
  },
});
