import { defineCommand } from '../command.js';

export const obsidianVaults = defineCommand({
  name: 'obsidian vaults',
  summary: "List Obsidian's vaults, most recent first, and a new folder Mesa suggests for one",
  example: 'mesa obsidian vaults',
  run: ({ mesa }) => {
    const data = mesa.vaultChoices();
    const lines = data.vaults.map((v) => v.path);
    return { data, text: [...lines, `suggested ${data.suggested}`].join('\n') };
  },
});
