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

/** The folders Mesa lays out at the vault's top, in creation order. */
export const VAULT_FOLDERS = [
  VAULT.raw,
  VAULT.wiki,
  VAULT.projects,
  VAULT.receipts,
  VAULT.daily,
] as const;

/**
 * What Obsidian, Mesa, Git, and Finder keep in a vault, at any depth: application internals, never
 * knowledge, so no vault path reaches one (scope.ts).
 */
export const INTERNALS = ['.obsidian', VAULT.mesa, '.trash', '.git', '.DS_Store'] as const;

/** A daily note's path inside the vault. */
export const dailyNotePath = (day: string) => `${VAULT.daily}/${day}.md`;

/** A project's hub note (CONTEXT.md, Project hub). */
export const projectHubPath = (project: string) => `${VAULT.projects}/${project}.md`;

/** Where a session's summary lands (the session-summary skill's landing). */
export const sessionSummaryPath = (id: string) => `${VAULT.wiki}/sessions/${id}.md`;
