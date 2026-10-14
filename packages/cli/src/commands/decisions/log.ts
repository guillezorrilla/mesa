import { type LogEntry, obsidianDateTime } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { wholeNumber } from '../../input/flags.js';
import { columns } from '../../output/columns.js';

// The Decision log: what each decision site answered, beside what the rules alone would have.

function logText(entries: LogEntry[]) {
  if (!entries.length) return 'no decisions logged in this period';
  return columns(
    entries.map((e) => {
      const at = obsidianDateTime(new Date(e.at)).replace('T', ' ');
      if (e.status === 'opened') return [at, 'opened', e.session, '', e.note];
      if (e.status === 'marked')
        return [at, 'marked', e.session ?? '', '', e.mark ?? 'cleared', e.moment];
      return [
        at,
        e.site,
        e.session ?? '',
        e.by,
        e.rules && e.rules !== e.answer
          ? `${e.answer ?? ''} (rules: ${e.rules})`
          : (e.answer ?? ''),
        e.status,
        e.note ?? e.reason ?? '',
      ];
    }),
  ).join('\n');
}

export const decisionsLog = defineCommand({
  name: 'decisions log',
  summary:
    "The Decision log, newest first: each model ask at the supervision and relevance sites and each guardrail stop, beside the rules' own answer",
  flags: {
    session: { type: 'string', description: 'Only this Mesa session' },
    days: { type: 'string', description: 'How many days back (default 7)' },
  },
  example: 'mesa decisions log --session 4e1b9c02 --days 30',
  run: ({ mesa, flags }) => {
    const entries = mesa.decisions.log({
      ...(flags.days === undefined ? {} : { days: wholeNumber(flags.days, '--days') }),
      ...(flags.session ? { session: flags.session } : {}),
    });
    return { data: entries, text: logText(entries) };
  },
});
