import { defineCommand } from '../command.js';

export const profile = defineCommand({
  name: 'profile',
  summary: 'Show the active profile and its directory',
  run: ({ mesa }) => ({ data: mesa.info(), text: mesa.info().profile }),
});
