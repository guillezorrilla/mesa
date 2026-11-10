import { defineCommand } from '../command.js';
import { commaList } from '../input/flags.js';

/** Run by a worker inside its Mesa window, once, when its work is done, failed, or blocked. */
export const report = defineCommand({
  name: 'report',
  summary:
    "Report your work to the session that started you: done, failed, or blocked (it must act), or ask it a question; it goes to your parent with Mesa's other child reports",
  args: ['kind', 'text'],
  flags: {
    files: { type: 'string', description: 'The files it touched or made, comma separated' },
  },
  example: 'mesa report done "Counted 12 tide tables; none missing" --files docs/tides.md',
  run: ({ mesa, args, flags }) => {
    if (args.kind === 'question') {
      const question = mesa.reports.ask(args.text);
      return {
        data: { question },
        text: `asked ${question.parent} question ${question.id}; end your turn, the answer comes as your next prompt`,
      };
    }
    const files = flags.files === undefined ? undefined : commaList(flags.files);
    const made = mesa.reports.report(args.kind, args.text, files);
    return {
      data: { report: made },
      text: `reported ${made.kind}${made.outcome ? ` (${made.outcome})` : ''} to ${made.parent}`,
    };
  },
});
