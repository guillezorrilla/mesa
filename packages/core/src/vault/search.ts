import { readFileSync } from 'node:fs';
import { clip } from '../lib/clip.js';
import { MesaError } from '../lib/result.js';
import { listVault } from './inventory.js';
import type { VaultFilter, VaultItem, VaultKind } from './item.js';
import { canvasOf, noteOf } from './reader.js';
import { vaultFile } from './scope.js';

// Vault search (CONTEXT.md, Vault search): `mesa vault search`, the Vault screen's search box, and
// the mesa-vault server's search_vault.

export const DEFAULT_VAULT_SEARCH_LIMIT = 50;
const SNIPPETS = 3;
const SNIPPET_LENGTH = 200;
/** How much of a long line a snippet keeps before the word it found. */
const LEAD = 40;

/** A line of an item with a searched word in it: its number (from 1) and its text, trimmed. */
export type VaultMatch = { line: number; text: string };

export type VaultHit = {
  path: string;
  kind: VaultKind;
  project?: string;
  /** Its file name, without `.md` for a note, as Obsidian titles it. */
  title: string;
  /** At most 3 lines, each at most 200 characters; none for a match on the path alone. */
  matches: VaultMatch[];
};

/** `mesa vault search`: how many items match, whether `items` stops short of that, the items. */
export type VaultSearch = { total: number; truncated: boolean; items: VaultHit[] };

export type VaultSearchFilter = VaultFilter & { limit?: number };

/** What search reads of an item beside its path: where its words count, and where lines show. */
type Searched = { text: string; lines: string[] };
const PATH_ONLY: Searched = { text: '', lines: [] };

/**
 * A note's frontmatter values and body, with the file's lines (so a line number is the file's); a
 * canvas's text nodes' text, its lines numbered as the reader lists them; a base's YAML. Any other
 * item, and one the system does not let Mesa read, is matched by its path alone.
 */
function searched(vault: string, item: VaultItem): Searched {
  if (item.kind !== 'markdown' && item.kind !== 'canvas' && item.kind !== 'base') return PATH_ONLY;
  let text: string;
  try {
    text = readFileSync(vaultFile(vault, item.path), 'utf8');
  } catch {
    return PATH_ONLY;
  }
  if (item.kind === 'base') return { text, lines: text.split('\n') };
  if (item.kind === 'canvas') {
    const canvas = canvasOf(text);
    const texts = canvas.preview === 'canvas' ? canvas.texts.join('\n') : '';
    return { text: texts, lines: texts ? texts.split('\n') : [] };
  }
  const { frontmatter, body } = noteOf(text);
  const values = Object.values(frontmatter).map((value) =>
    typeof value === 'string' ? value : JSON.stringify(value),
  );
  return { text: [...values, body].join('\n'), lines: text.split('\n') };
}

/** The line in at most 200 characters: a long one from a little before the word it found. */
function snippet(line: string, at: number) {
  const chars = Array.from(line);
  if (chars.length <= SNIPPET_LENGTH) return line;
  // `at` belongs to the lowercase string: İ expands to i + combining dot, and emoji use two
  // UTF-16 units. Count back to the original code points before choosing the snippet's start.
  let match = 0;
  let lower = 0;
  for (const char of chars) {
    const length = char.toLocaleLowerCase().length;
    if (lower + length > at) break;
    lower += length;
    match++;
  }
  const start = Math.max(0, match - LEAD);
  return clip(`${start ? '...' : ''}${chars.slice(start).join('')}`, SNIPPET_LENGTH);
}

/** The first lines with any of the words in them, each as a snippet. */
function matchesIn(lines: readonly string[], words: readonly string[]): VaultMatch[] {
  const matches: VaultMatch[] = [];
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const lower = line.toLocaleLowerCase();
    const at = Math.min(...words.map((word) => lower.indexOf(word)).filter((i) => i >= 0));
    if (at === Number.POSITIVE_INFINITY) continue;
    matches.push({ line: index + 1, text: snippet(line, at) });
    if (matches.length === SNIPPETS) break;
  }
  return matches;
}

/**
 * The vault's items with every word of `text` in them, case aside: in the path (the title is the
 * file name), a note's frontmatter values or body, a canvas's text nodes, or a base's YAML. Only
 * items of `filter`'s project and type (listVault's rule), and only those the inventory lists as
 * available, so internals and links out of scope never appear; each is read through `vaultFile`.
 * Those with every word in the path come first, then the newest; `limit` (50 by default) caps
 * `items`, and `total` counts them all. No word, or a limit that is not a positive whole number,
 * is usage.
 * ponytail: a linear scan that reads every Markdown, canvas, and base item on each search; an
 * index kept as notes change is the upgrade once a vault is too big for that.
 */
export function searchVault(
  vault: string,
  text: string,
  { limit = DEFAULT_VAULT_SEARCH_LIMIT, ...filter }: VaultSearchFilter = {},
): VaultSearch {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new MesaError('usage', `the limit must be a positive whole number, not ${limit}`);
  }
  const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) throw new MesaError('usage', 'search the vault for at least one word');
  const found: { hit: VaultHit; named: boolean; modified: string }[] = [];
  for (const item of listVault(vault, filter)) {
    if (item.unavailable) continue;
    const path = item.path.toLocaleLowerCase();
    const { text: body, lines } = searched(vault, item);
    const all = `${path}\n${body.toLocaleLowerCase()}`;
    if (!words.every((word) => all.includes(word))) continue;
    const name = item.path.slice(item.path.lastIndexOf('/') + 1);
    const hit: VaultHit = {
      path: item.path,
      kind: item.kind,
      ...(item.project ? { project: item.project } : {}),
      title: item.kind === 'markdown' ? name.replace(/\.md$/i, '') : name,
      matches: matchesIn(lines, words),
    };
    found.push({ hit, named: words.every((word) => path.includes(word)), modified: item.modified });
  }
  // listVault sorts by path, and the sort is stable: items alike stay in path order.
  found.sort((a, b) => Number(b.named) - Number(a.named) || b.modified.localeCompare(a.modified));
  return {
    total: found.length,
    truncated: found.length > limit,
    items: found.slice(0, limit).map(({ hit }) => hit),
  };
}
