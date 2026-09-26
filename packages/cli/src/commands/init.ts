import { AGENT_NAMES, DEFAULT_AGENT } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const init = defineCommand({
  name: 'init',
  summary: 'Create the profile directory and its config.yaml',
  flags: {
    vault: { type: 'string', required: true, description: 'Path of the vault this profile owns' },
    agent: {
      type: 'string',
      description: `Default agent: claude (v1; ${AGENT_NAMES.join(', ')} are known), default ${DEFAULT_AGENT}`,
    },
  },
  example: 'mesa init --vault ~/vault',
  run: ({ mesa, flags }) => {
    const recorded = mesa.init({ vault: flags.vault, agent: flags.agent });
    const { created, path } = recorded.result;
    const info = mesa.info();
    const text = created
      ? `initialised profile ${info.profile} at ${path}`
      : `profile ${info.profile} already initialised`;
    return recordedOutput(recorded, { data: { ...info, created }, text });
  },
});
