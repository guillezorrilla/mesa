import { DEFAULT_RECEIPT_LIMIT, RECEIPT_TYPES } from '@mesa/core';
import { stringify } from 'yaml';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';
import { columns } from '../output/columns.js';

export const receipts = defineCommand({
  name: 'receipts',
  summary: 'List the newest receipts in the vault, with their frontmatter; of one session or type',
  flags: {
    limit: { type: 'string', description: `How many to list (default ${DEFAULT_RECEIPT_LIMIT})` },
    session: { type: 'string', description: 'Only the receipts of this Mesa session id' },
    type: {
      type: 'string',
      description: `Only the receipts of one type: ${RECEIPT_TYPES.join(', ')}`,
    },
  },
  example: 'mesa receipts --type skill --limit 5',
  run: ({ mesa, flags }) => {
    const entries = mesa.receipts.list({
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
      session: flags.session,
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
