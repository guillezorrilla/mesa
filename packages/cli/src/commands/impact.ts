import { foldedText, type ImpactReport, obsidianDateTime } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';

// What Mesa decided and kept, and what happened next (CONTEXT.md, Impact).

function impactText(report: ImpactReport) {
  return [
    report.sentence,
    ...report.sessions.flatMap((s) => [
      '',
      `${s.name}${s.project ? ` (${s.project})` : ''}`,
      ...s.moments.map(
        (m) =>
          `  ${obsidianDateTime(new Date(m.at)).slice(11)}  ${m.title}${m.rulesAlone ? ` (rules: ${m.rulesAlone})` : ''}${m.outcome ? `. ${m.outcome.text}` : ''}`,
      ),
      ...[foldedText(s)].flatMap((line) => (line ? [`  ${line}`] : [])),
    ]),
  ].join('\n');
}

export const impact = defineCommand({
  name: 'impact',
  summary:
    "What Mesa decided and kept for you, and what happened next: each session's Moments under a one-sentence summary",
  flags: {
    days: { type: 'string', description: 'How many days back (default 7)' },
    project: { type: 'string', description: 'Only this project' },
    session: { type: 'string', description: 'Only this Mesa session' },
  },
  example: 'mesa impact --project lantern-cove --days 30',
  run: ({ mesa, flags }) => {
    const report = mesa.impact.report({
      ...(flags.days === undefined ? {} : { days: wholeNumber(flags.days, '--days') }),
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.session ? { session: flags.session } : {}),
    });
    return { data: report, text: impactText(report) };
  },
});
