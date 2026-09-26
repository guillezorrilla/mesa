import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import { RECEIPT_FILE } from '../receipts/receipt-file.js';
import { VAULT } from './layout.js';

const MARK = 'vault initialised by mesa';
// Relative to this module, so it resolves from src (vitest) and from dist (the built CLI).
const TEMPLATE = new URL('../../templates/vault-AGENTS.md', import.meta.url);
const INDEX = '# Index\n\nOne line per note in `wiki/` and `projects/`: a link and a summary.\n';

type Item =
  | { name: string; kind: 'folder' }
  | { name: string; kind: 'file'; content: (now: Date) => string };

// The layout from ADR-0006, in creation order. log.md comes first: its first line marks the
// folder as a Mesa vault (see acceptsMesaWrites), so an interrupted init can be rerun without --force.
const LAYOUT: Item[] = [
  { name: VAULT.log, kind: 'file', content: (now) => `- ${now.toISOString()} ${MARK}\n` },
  { name: VAULT.agents, kind: 'file', content: () => readFileSync(TEMPLATE, 'utf8') },
  { name: VAULT.index, kind: 'file', content: () => INDEX },
  ...[VAULT.raw, VAULT.wiki, VAULT.projects, VAULT.receipts, VAULT.daily].map((name) => ({
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

// Finder's .DS_Store and Mesa's own .mesa/ (the vault lock) do not make a folder non-empty.
const IGNORED = ['.DS_Store', VAULT.mesa];

const receiptsOnly = (dir: string): boolean =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .every((e) => RECEIPT_FILE.test(e.name));

/**
 * Whether Mesa may write into `path`: a missing or empty folder; an Obsidian vault (`.obsidian/`
 * is only looked for, never read); a Mesa vault (log.md starts with the line init writes); or a
 * vault Mesa started, holding nothing but receipts. The one rule for vault init and receipts.
 */
export function acceptsMesaWrites(path: string): boolean {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return true;
  if (!stat.isDirectory()) return false;
  const entries = readdirSync(path).filter((n) => !IGNORED.includes(n));
  if (entries.length === 0 || entries.includes('.obsidian')) return true;
  if (entries.length === 1 && entries[0] === VAULT.receipts)
    return receiptsOnly(join(path, VAULT.receipts));
  if (!entries.includes(VAULT.log)) return false;
  const first = readFileSync(join(path, VAULT.log), 'utf8').split('\n', 1)[0] ?? '';
  return first.startsWith('- ') && first.endsWith(` ${MARK}`);
}

export function vaultStatus(path: string): VaultStatus {
  const missing = LAYOUT.filter((item) => !present(path, item)).map((i) => i.name);
  return { path, ok: missing.length === 0, missing };
}

/**
 * Creates whatever of the layout is missing and returns what it created. An existing file is
 * never overwritten, so a second run on a complete vault writes nothing. A folder Mesa may write
 * into (acceptsMesaWrites) is laid out; any other folder (a repo, say) needs `force`.
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
  if (missing.length && !force && !acceptsMesaWrites(path)) {
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
