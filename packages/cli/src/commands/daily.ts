import { defineCommand } from '../command.js';

export const daily = defineCommand({
  name: 'daily',
  summary: "Rebuild a day's meaningful history, preserving user content",
  flags: { date: { type: 'string', description: 'Local calendar day YYYY-MM-DD (default today)' } },
  example: 'mesa daily --date 2026-09-24',
  run: async ({ mesa, flags }) => {
    const data = await mesa.daily.build(flags.date);
    return {
      data,
      text: `${data.changed ? 'rebuilt' : 'unchanged'} ${data.path}: ${data.decisions} decisions, ${data.changes} vault changes, ${data.log} log entries`,
    };
  },
});
