// The vault's layout (CONTEXT.md, Vault; ADR-0006): the one module that knows its names.

/** The names at a vault's top, as Mesa lays them out, and Mesa's own folder (the vault lock). */
export const VAULT = {
  log: 'log.md',
  agents: 'AGENTS.md',
  index: 'index.md',
  raw: 'raw',
  wiki: 'wiki',
  projects: 'projects',
  receipts: 'receipts',
  daily: 'daily',
  mesa: '.mesa',
} as const;

/** A daily note's path inside the vault. */
export const dailyNotePath = (day: string) => `${VAULT.daily}/${day}.md`;
