import { type Dirent, lstatSync, readdirSync, readFileSync, type Stats, statSync } from 'node:fs';
import { join } from 'node:path';
import { MesaError } from '../lib/result.js';
import { type Frontmatter, parseNote } from './frontmatter.js';
import {
  itemCategory,
  itemKind,
  itemProject,
  matchesVaultFilter,
  type Unavailable,
  VAULT_CATEGORIES,
  VAULT_KINDS,
  type VaultFilter,
  type VaultItem,
} from './item.js';
import { isInternal, outOfScope, requireVaultFolder } from './scope.js';

/** `mesa vault list`: the vault, how many items it lists, and the items. */
export type VaultInventory = { vault: string; total: number; items: VaultItem[] };

const TYPES: readonly string[] = [...VAULT_KINDS, ...VAULT_CATEGORIES];

/** A note's frontmatter; unreadable is distinct from readable but malformed YAML. */
function frontmatterOf(file: string): Frontmatter | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return parseNote(text).frontmatter;
  } catch {
    return {};
  }
}

function item(path: string, stat: Stats, frontmatter?: Frontmatter, unavailable?: Unavailable) {
  const project = itemProject(path, frontmatter);
  const listed: VaultItem = {
    path,
    kind: itemKind(path),
    category: itemCategory(path),
    ...(project ? { project } : {}),
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
  return unavailable ? { ...listed, unavailable } : listed;
}

/**
 * One file (or link) at `path`. Only a markdown file in the vault's scope is read, for its
 * frontmatter; a link is followed only when its target is in scope, and never into a folder.
 */
function entry(vault: string, path: string, link: boolean): VaultItem {
  const file = join(vault, path);
  const own = lstatSync(file);
  const refused = link ? outOfScope(vault, path) : undefined;
  if (refused) return item(path, own, undefined, refused);
  const stat = link ? statSync(file) : own;
  if (stat.isDirectory()) return item(path, own, undefined, 'a folder link');
  if (!stat.isFile()) return item(path, own, undefined, 'unreadable');
  if (itemKind(path) !== 'markdown') return item(path, stat);
  const frontmatter = frontmatterOf(file);
  return item(path, stat, frontmatter, frontmatter === undefined ? 'unreadable' : undefined);
}

/**
 * Every item under the vault but its internals (scope.ts), sorted by path, with no cap; only those
 * of `filter`'s project and type (a kind or a category, else usage). A folder that does not open
 * is one `unreadable` item. A missing vault is not_found.
 */
export function listVault(vault: string, filter: VaultFilter = {}): VaultItem[] {
  if (filter.type !== undefined && !TYPES.includes(filter.type)) {
    throw new MesaError(
      'usage',
      `a vault item's type is a kind (${VAULT_KINDS.join(', ')}) or a category (${VAULT_CATEGORIES.join(', ')}), not ${filter.type}`,
    );
  }
  requireVaultFolder(vault);
  const items: VaultItem[] = [];
  const walk = (folder: string) => {
    let children: Dirent[];
    try {
      children = readdirSync(join(vault, folder), { withFileTypes: true });
    } catch (error) {
      if (!folder) throw error;
      items.push(item(folder, lstatSync(join(vault, folder)), undefined, 'unreadable'));
      return;
    }
    for (const child of children) {
      if (isInternal(child.name)) continue;
      const path = folder ? `${folder}/${child.name}` : child.name;
      if (child.isDirectory()) walk(path);
      else items.push(entry(vault, path, child.isSymbolicLink()));
    }
  };
  walk('');
  return items
    .filter((listed) => matchesVaultFilter(listed, filter))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
