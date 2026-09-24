import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from './clock.js';
import { MesaError } from './result.js';

const MARK = 'vault initialised by mesa';
// Relative to this module, so it resolves from src (vitest) and from dist (the built CLI).
const TEMPLATE = new URL('../templates/vault-AGENTS.md', import.meta.url);
const INDEX = '# Index\n\nOne line per note in `wiki/` and `projects/`: a link and a summary.\n';

type Item =
  | { name: string; kind: 'folder' }
  | { name: string; kind: 'file'; content: (now: Date) => string };

// The layout from ADR-0006, in creation order. log.md comes first: its first line marks the
// folder as a Mesa vault (see isVault), so an interrupted init can be rerun without --force.
const LAYOUT: Item[] = [
  { name: 'log.md', kind: 'file', content: (now) => `- ${now.toISOString()} ${MARK}\n` },
  { name: 'AGENTS.md', kind: 'file', content: () => readFileSync(TEMPLATE, 'utf8') },
  { name: 'index.md', kind: 'file', content: () => INDEX },
  ...['raw', 'wiki', 'projects', 'receipts', 'daily'].map((name) => ({
    name,
    kind: 'folder' as const,
  })),
];

export const VAULT_LAYOUT = LAYOUT.map((i) => i.name);

export type VaultStatus = { path: string; ok: boolean; missing: string[] };

const present = (path: string, item: Item) => {
  const stat = statSync(join(path, item.name), { throwIfNoEntry: false });
  return item.kind === 'folder' ? stat?.isDirectory() === true : stat?.isFile() === true;
};

/**
 * What counts as a vault: a folder with `.obsidian/` (an Obsidian vault the user points Mesa at)
 * or whose log.md starts with the line init writes. `.obsidian/` is only looked for, never read.
 */
function isVault(path: string, entries: string[]): boolean {
  if (entries.includes('.obsidian')) return true;
  if (!entries.includes('log.md')) return false;
  const first = readFileSync(join(path, 'log.md'), 'utf8').split('\n', 1)[0] ?? '';
  return first.startsWith('- ') && first.endsWith(` ${MARK}`);
}

export function vaultStatus(path: string): VaultStatus {
  const missing = LAYOUT.filter((item) => !present(path, item)).map((i) => i.name);
  return { path, ok: missing.length === 0, missing };
}

/**
 * Creates whatever of the layout is missing and returns what it created. An existing file is
 * never overwritten, so a second run on a complete vault writes nothing. A missing or empty
 * folder, or a vault, is laid out; any other folder (a repo, say) needs `force`.
 */
export function initVault(opts: { path: string; force?: boolean; clock: Clock }): {
  path: string;
  created: string[];
} {
  const { path, force = false, clock } = opts;
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory() === false) {
    throw new MesaError('invalid_config', `vault ${path} is not a folder`);
  }
  const missing = LAYOUT.filter((item) => !present(path, item));
  const clash = missing.find((item) => existsSync(join(path, item.name)));
  if (clash) {
    throw new MesaError(
      'invalid_config',
      `${join(path, clash.name)} exists but is not a ${clash.kind}`,
    );
  }
  // Finder drops .DS_Store into any folder it opens, so it does not make a folder non-empty.
  const entries = existsSync(path) ? readdirSync(path).filter((n) => n !== '.DS_Store') : [];
  if (missing.length && entries.length && !force && !isVault(path, entries)) {
    throw new MesaError(
      'invalid_config',
      `${path} is not empty and is not a vault; set another vault path with mesa config set vault <path>, or rerun with --force`,
    );
  }
  mkdirSync(path, { recursive: true });
  const now = clock();
  for (const item of missing) {
    const target = join(path, item.name);
    if (item.kind === 'folder') mkdirSync(target, { recursive: true });
    else writeFileSync(target, item.content(now), { flag: 'wx' });
  }
  return { path, created: missing.map((i) => i.name) };
}
