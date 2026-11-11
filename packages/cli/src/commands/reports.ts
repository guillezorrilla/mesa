import type { PendingReport } from '@mesa/core';
import { defineCommand } from '../command.js';

const line = (r: PendingReport) =>
  `${r.parent} <- ${r.child} (${r.childName}) ${r.kind}${r.outcome ? ` ${r.outcome}` : ''}${r.tool ? ` ${r.tool}` : ''}${r.state ? ` ${r.state}` : ''} ${r.at}${r.heldUntil ? ` held until ${r.heldUntil}` : ''}`;

export const reports = defineCommand({
  name: 'reports',
  summary:
    "List child sessions' reports waiting for their parent; --deliver types them into idle parents",
  args: ['session?'],
  flags: {
    deliver: {
      type: 'boolean',
      description:
        "Type each idle parent's due reports as one prompt; busy parents wait, and a finished turn is held until its child stays idle (sessions.reportHoldSeconds)",
    },
  },
  example: 'mesa reports --deliver',
  run: async ({ mesa, args, flags }) => {
    if (flags.deliver) {
      const data = await mesa.reports.deliver();
      return {
        data,
        text: [
          ...data.deliveries.map(
            (d) =>
              `${d.session}: ${d.status} ${d.reports.length} reports${d.reason ? ` (${d.reason})` : ''}`,
          ),
          ...data.held.map(line),
        ].join('\n'),
      };
    }
    const data = mesa.reports.list(args.session);
    return {
      data,
      text: [
        `child reports: ${data.enabled ? 'on' : 'off (sessions.childReports)'}`,
        ...data.reports.map(line),
        ...data.questions.map((q) => `${q.parent} <- ${q.child} (${q.childName}) asks ${q.id}`),
      ].join('\n'),
    };
  },
});

export const reportsReply = defineCommand({
  name: 'reports reply',
  summary:
    "Answer a worker's question (mesa report question): types the answer into the worker as mesa send does, and marks it answered",
  args: ['question', 'answer'],
  example: 'mesa reports reply q-7k2m "Metres"',
  run: async ({ mesa, args }) => {
    const data = await mesa.reports.reply(args.question, args.answer);
    return { data, text: `answered ${data.question.id} in ${data.question.child}` };
  },
});
