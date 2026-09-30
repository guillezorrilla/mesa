import { EXIT_CODES, VAULT_CATEGORIES, VAULT_KINDS } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const vaultInit = defineCommand({
  name: 'vault init',
  summary: 'Lay out the profile vault; only what is missing is created',
  flags: {
    force: { type: 'boolean', description: 'Lay out a folder that is not empty and not a vault' },
  },
  example: 'mesa vault init',
  run: ({ mesa, flags }) => {
    const recorded = mesa.vault.init(flags.force ?? false);
    const { path, created } = recorded.result;
    const said = created.length
      ? `created ${created.join(', ')} in ${path}`
      : 'vault already initialised';
    return recordedOutput(recorded, { data: { path, created }, text: said });
  },
});

export const vaultStatus = defineCommand({
  name: 'vault status',
  summary: 'Check that the profile vault has its layout',
  example: 'mesa vault status',
  run: ({ mesa }) => {
    const status = mesa.vault.status();
    const text = status.ok
      ? `vault ok: ${status.path}`
      : `vault ${status.path} is missing: ${status.missing.join(', ')}`;
    return { data: status, text, code: status.ok ? 0 : EXIT_CODES.not_found };
  },
});

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

export const vaultOpen = defineCommand({
  name: 'vault open',
  summary: 'Open the vault, or one note in it, in Obsidian',
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
