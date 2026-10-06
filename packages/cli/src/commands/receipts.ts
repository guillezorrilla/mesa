import { DEFAULT_RECEIPT_LIMIT, RECEIPT_TYPES, RECORD_KINDS } from '@mesa/core';
import { stringify } from 'yaml';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
import { columns } from '../output/columns.js';

export const receipts = defineCommand({
  name: 'receipts',
  summary: 'List meaningful decisions and vault changes, or historical receipts',
  flags: {
    limit: { type: 'string', description: `How many to list (default ${DEFAULT_RECEIPT_LIMIT})` },
    session: { type: 'string', description: 'Only the receipts of this Mesa session id' },
    project: { type: 'string', description: 'Only the receipts of this project' },
    kind: { type: 'string', description: `Only one kind: ${RECORD_KINDS.join(', ')}` },
    type: {
      type: 'string',
      description: `Only the receipts of one type: ${RECEIPT_TYPES.join(', ')}`,
    },
  },
  example: 'mesa receipts --project lantern-cove --kind decision',
  run: ({ mesa, flags }) => {
    const entries = mesa.receipts.list({
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
      session: flags.session,
      project: flags.project,
      kind: flags.kind,
      type: flags.type,
    });
    const text = entries.length
      ? columns(
          entries.map((e) => [
            e.receipt.started,
            e.receipt.type,
            e.receipt.status,
            e.receipt.id,
            e.summary,
          ]),
        ).join('\n')
      : 'no receipts yet';
    return { data: entries, text };
  },
});

export const receiptsShow = defineCommand({
  name: 'receipts show',
  summary: 'Print one receipt by id',
  args: ['id'],
  example: 'mesa receipts show 01K62V4Q8J3M5N7P9R1S2T3V4W',
  run: ({ mesa, args }) => {
    const entry = mesa.receipts.show(args.id);
    return {
      data: entry,
      text: `${entry.path}\n\n${stringify(entry.receipt).trimEnd()}\n\n${entry.body.trimEnd()}`,
    };
  },
});
