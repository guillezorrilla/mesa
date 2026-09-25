import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

export const vaultInit = defineCommand({
  name: 'vault init',
  summary: 'Lay out the profile vault; only what is missing is created',
  flags: {
    force: { type: 'boolean', description: 'Lay out a folder that is not empty and not a vault' },
  },
  run: ({ mesa, flags }) => {
    const recorded = mesa.vault.init(flags.force ?? false);
    const { path, created } = recorded.result;
    const said = created.length
      ? `created ${created.join(', ')} in ${path}`
      : 'vault already initialised';
    const { receipt, text } = withReceipt(recorded, said);
    return { data: { path, created, ...receipt }, text };
  },
});

export const vaultStatus = defineCommand({
  name: 'vault status',
  summary: 'Check that the profile vault has its layout',
  run: ({ mesa }) => {
    const status = mesa.vault.status();
    const text = status.ok
      ? `vault ok: ${status.path}`
      : `vault ${status.path} is missing: ${status.missing.join(', ')}`;
    return { data: status, text, code: status.ok ? 0 : EXIT_CODES.not_found };
  },
});

export const vaultOpen = defineCommand({
  name: 'vault open',
  summary: 'Open the vault, or one note in it, in Obsidian',
  args: ['note?'],
  flags: {
    cli: { type: 'boolean', description: 'Use the Obsidian CLI for a note when it is registered' },
  },
  run: async ({ mesa, args, flags }) => {
    const { opened, method, target } = await mesa.vault.open(args.note, flags.cli ?? false);
    return { data: { opened, method, target }, text: `opened ${target} (${method})` };
  },
});
