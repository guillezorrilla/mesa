import { AGENT_NAMES, DEFAULT_AGENT } from '@mesa/core';
import { defineCommand } from '../command.js';
import { withReceipt } from '../receipt-output.js';

export const init = defineCommand({
  name: 'init',
  summary: 'Create the profile directory and its config.yaml',
  flags: {
    vault: { type: 'string', required: true, description: 'Path of the vault this profile owns' },
    agent: {
      type: 'string',
      description: `Default agent: ${AGENT_NAMES.join(' or ')} (default ${DEFAULT_AGENT})`,
    },
  },
  example: 'mesa init --vault ~/vault',
  run: ({ mesa, flags }) => {
    const recorded = mesa.init({ vault: flags.vault, agent: flags.agent });
    const { created, path } = recorded.result;
    const { profile } = mesa.info();
    const said = created
      ? `initialised profile ${profile} at ${path}`
      : `profile ${profile} already initialised`;
    const { receipt, text } = withReceipt(recorded, said);
    return { data: { ...mesa.info(), created, ...receipt }, text };
  },
});
