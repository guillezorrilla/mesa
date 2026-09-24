import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../command.js';

export const vaultInit = defineCommand({
  name: 'vault init',
  summary: 'Lay out the profile vault; only what is missing is created',
  flags: {
    force: { type: 'boolean', description: 'Lay out a folder that is not empty and not a vault' },
  },
  run: ({ mesa, flags }) => {
    const { path, created } = mesa.vault.init(flags.force ?? false);
    const text = created.length
      ? `created ${created.join(', ')} in ${path}`
      : 'vault already initialised';
    return { data: { path, created }, text };
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
