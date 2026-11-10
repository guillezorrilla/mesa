import type { ChildReport } from '@mesa/core';
import { defineCommand } from '../command.js';

const line = (r: ChildReport) =>
  `${r.parent} <- ${r.child} (${r.childName}) ${r.kind}${r.outcome ? ` ${r.outcome}` : ''}${r.tool ? ` ${r.tool}` : ''}${r.state ? ` ${r.state}` : ''} ${r.at}`;

export const reports = defineCommand({
  name: 'reports',
  summary:
    "List child sessions' reports waiting for their parent; --deliver types them into idle parents",
  args: ['session?'],
  flags: {
    deliver: {
      type: 'boolean',
      description: "Type each idle parent's pending reports as one prompt; busy parents wait",
    },
  },
  example: 'mesa reports --deliver',
  run: async ({ mesa, args, flags }) => {
    if (flags.deliver) {
      const data = await mesa.reports.deliver();
      return {
        data,
        text: data.deliveries
          .map(
            (d) =>
              `${d.session}: ${d.status} ${d.reports.length} reports${d.reason ? ` (${d.reason})` : ''}`,
          )
          .join('\n'),
      };
    }
    const data = mesa.reports.list(args.session);
    return {
      data,
      text: [
        `child reports: ${data.enabled ? 'on' : 'off (sessions.childReports)'}`,
        ...data.reports.map(line),
      ].join('\n'),
    };
  },
});
