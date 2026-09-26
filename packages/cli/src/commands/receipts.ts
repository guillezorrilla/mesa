import { DEFAULT_RECEIPT_LIMIT, MesaError } from '@mesa/core';
import { stringify } from 'yaml';
import { defineCommand } from '../command.js';
import { columns } from '../format.js';

export const receipts = defineCommand({
  name: 'receipts',
  summary: 'List the newest receipts in the vault, with their frontmatter',
  flags: {
    limit: { type: 'string', description: `How many to list (default ${DEFAULT_RECEIPT_LIMIT})` },
  },
  example: 'mesa receipts --limit 5',
  run: ({ mesa, flags }) => {
    const limit = flags.limit === undefined ? DEFAULT_RECEIPT_LIMIT : Number(flags.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new MesaError('usage', `--limit must be a positive whole number, not ${flags.limit}`);
    }
    const entries = mesa.receipts.list(limit);
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
