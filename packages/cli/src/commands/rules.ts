import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

const project = { type: 'string' as const, description: 'Registered project scope' };

export const rulesList = defineCommand({
  name: 'rules list',
  summary: 'List installed provider instruction files',
  flags: { project },
  example: 'mesa rules list --project lantern-cove',
  run: ({ mesa, flags }) => {
    const rows = mesa.rules.list(flags.project);
    return {
      data: rows,
      text: rows.length
        ? columns(rows.map((row) => [row.name, row.scope, row.providers.join(','), row.path])).join(
            '\n',
          )
        : 'no rules found',
    };
  },
});

export const rulesRead = defineCommand({
  name: 'rules read',
  summary: 'Preview an installed instruction file with its revision',
  args: ['id'],
  flags: { project },
  example: 'mesa rules read /path/to/AGENTS.md --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    const data = mesa.rules.read(args.id, flags.project);
    return { data, text: data.text };
  },
});

export const rulesWrite = defineCommand({
  name: 'rules write',
  summary: 'Save a writable instruction file when its read revision is current',
  args: ['id'],
  flags: {
    project,
    text: { type: 'string', required: true, description: 'New UTF-8 text' },
    revision: { type: 'string', required: true, description: 'Revision from rules read' },
  },
  example: 'mesa rules write /path/to/AGENTS.md --text "New text" --revision <sha256>',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.rules.write(args.id, flags.text, flags.revision, flags.project);
    return recordedOutput(recorded, { data: recorded.result, text: `saved ${args.id}` });
  },
});
