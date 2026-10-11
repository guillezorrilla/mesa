import { RELEASE_GROUPS } from '@mesa/core';
import { defineCommand } from '../command.js';

export const whatsNew = defineCommand({
  name: 'whats-new',
  summary:
    "Show a version's release notes: what is new, changed and fixed, the running one's by default",
  args: ['version?'],
  example: 'mesa whats-new 0.1.4',
  run: ({ mesa, args }) => {
    const data = mesa.whatsNew(args.version);
    const groups = RELEASE_GROUPS.filter(({ key }) => data[key].length).map(
      ({ key, label }) => `${label}\n${data[key].map((note) => `- ${note}`).join('\n')}`,
    );
    const text = [`What's new in ${data.version} (${data.date})`, ...groups].join('\n\n');
    return { data, text: groups.length ? text : `${text}\n\nNo notes for this version.` };
  },
});
