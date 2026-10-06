import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { recordedOutput } from '../../output/recorded.js';

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

export const vaultBases = defineCommand({
  name: 'vault bases',
  summary: 'Write owned receipts and sessions Bases views; keep user files',
  example: 'mesa vault bases',
  run: async ({ mesa }) => {
    const result = await mesa.vault.bases();
    return {
      data: result,
      text: [
        ...result.written.map((path) => `written ${path}`),
        ...result.kept.map((path) => `kept ${path}`),
      ].join('\n'),
    };
  },
});
