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

export const obsidianManager = defineCommand({
  name: 'obsidian manager',
  summary:
    'Open Obsidian\'s vault manager, where "Open folder as vault" adds a vault it does not know',
  example: 'mesa obsidian manager',
  run: async ({ mesa }) => {
    const data = await mesa.openVaultManager();
    return { data, text: `opened ${data.target}` };
  },
});
