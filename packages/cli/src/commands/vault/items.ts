import { DEFAULT_VAULT_SEARCH_LIMIT, VAULT_CATEGORIES, VAULT_KINDS } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { wholeNumber } from '../../input/flags.js';
import { columns } from '../../output/columns.js';
import { readText } from './text.js';

export const vaultList = defineCommand({
  name: 'vault list',
  summary: 'List every item in the profile vault, its internals aside',
  flags: {
    project: { type: 'string', description: 'Only the items of this project' },
    type: {
      type: 'string',
      description: `Only one kind (${VAULT_KINDS.join(', ')}) or category (${VAULT_CATEGORIES.join(', ')})`,
    },
  },
  example: 'mesa vault list --type receipts',
  run: ({ mesa, flags }) => {
    const inventory = mesa.vault.list({ project: flags.project, type: flags.type });
    const rows = columns(
      inventory.items.map((i) => [
        i.kind,
        i.category,
        i.project ?? '-',
        i.unavailable ? `${i.path} (${i.unavailable})` : i.path,
      ]),
    );
    const said = `${inventory.total} ${inventory.total === 1 ? 'item' : 'items'} in ${inventory.vault}`;
    return { data: inventory, text: [...rows, said].join('\n') };
  },
});

export const vaultRead = defineCommand({
  name: 'vault read',
  summary: 'Read one vault item: a note with its properties, links, and backlinks, or its preview',
  args: ['path'],
  example: 'mesa vault read wiki/harbour-lights.md',
  run: ({ mesa, args }) => {
    const read = mesa.vault.read(args.path);
    return { data: read, text: readText(read) };
  },
});

export const vaultSearch = defineCommand({
  name: 'vault search',
  summary: 'Find the vault items with every word in them: paths, notes, canvases, and bases',
  args: ['words...'],
  flags: {
    project: { type: 'string', description: 'Only the items of this project' },
    type: {
      type: 'string',
      description: `Only one kind (${VAULT_KINDS.join(', ')}) or category (${VAULT_CATEGORIES.join(', ')})`,
    },
    limit: {
      type: 'string',
      description: `How many to list (default ${DEFAULT_VAULT_SEARCH_LIMIT})`,
    },
  },
  example: 'mesa vault search harbour lights --project tide',
  run: ({ mesa, args, flags }) => {
    const found = mesa.vault.search(args.words.join(' '), {
      project: flags.project,
      type: flags.type,
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
    });
    const lines = found.items.flatMap((hit) => [
      `${hit.path} (${hit.kind})`,
      ...hit.matches.map((match) => `  ${match.line}: ${match.text}`),
    ]);
    const count = `${found.total} ${found.total === 1 ? 'item' : 'items'}`;
    const said = found.truncated ? `${found.items.length} of ${count}` : count;
    return { data: found, text: [...lines, said].join('\n') };
  },
});

export const vaultOpen = defineCommand({
  name: 'vault open',
  summary: 'Open the vault, or one item in it, in Obsidian',
  args: ['note?'],
  flags: {
    cli: { type: 'boolean', description: 'Use the Obsidian CLI for a note when it is registered' },
  },
  example: 'mesa vault open daily/2026-09-25',
  run: async ({ mesa, args, flags }) => {
    const { opened, method, target } = await mesa.vault.open(args.note, flags.cli ?? false);
    return { data: { opened, method, target }, text: `opened ${target} (${method})` };
  },
});
