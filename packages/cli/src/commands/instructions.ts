import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

const project = { type: 'string' as const, description: 'Registered project scope' };

export const instructionsList = defineCommand({
  name: 'instructions list',
  summary: 'List installed provider instruction files',
  flags: { project },
  example: 'mesa instructions list --project lantern-cove',
  run: ({ mesa, flags }) => {
    const rows = mesa.instructions.list(flags.project);
    return {
      data: rows,
      text: rows.length
        ? columns(rows.map((row) => [row.name, row.scope, row.providers.join(','), row.path])).join(
            '\n',
          )
        : 'no instruction files found',
    };
  },
});

export const instructionsRead = defineCommand({
  name: 'instructions read',
  summary: 'Preview an installed instruction file with its revision',
  args: ['id'],
  flags: { project },
  example: 'mesa instructions read /path/to/AGENTS.md --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    const data = mesa.instructions.read(args.id, flags.project);
    return { data, text: data.text };
  },
});

export const instructionsWrite = defineCommand({
  name: 'instructions write',
  summary: 'Save a writable instruction file when its read revision is current',
  args: ['id'],
  flags: {
    project,
    text: { type: 'string', required: true, description: 'New UTF-8 text' },
    revision: { type: 'string', required: true, description: 'Revision from instructions read' },
  },
  example: 'mesa instructions write /path/to/AGENTS.md --text "New text" --revision <sha256>',
  run: ({ mesa, args, flags }) => {
    const recorded = mesa.instructions.write(args.id, flags.text, flags.revision, flags.project);
    return recordedOutput(recorded, { data: recorded.result, text: `saved ${args.id}` });
  },
});
