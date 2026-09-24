import { AGENT_NAMES, DEFAULT_AGENT } from '@mesa/core';
import { defineCommand } from '../command.js';

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
  run: ({ mesa, flags }) => {
    const { created, path } = mesa.init({ vault: flags.vault, agent: flags.agent });
    const { profile } = mesa.info();
    const text = created
      ? `initialised profile ${profile} at ${path}`
      : `profile ${profile} already initialised`;
    return { data: { ...mesa.info(), created }, text };
  },
});
