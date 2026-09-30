import { readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MesaError } from '../lib/result.js';
import { baseViews } from './bases.js';
import { type CanvasData, parseCanvas } from './canvas.js';
import { type Frontmatter, parseNote } from './frontmatter.js';
import { listVault } from './inventory.js';
import type { VaultItem } from './item.js';
import { type LinkIndex, linkIndex, resolveLinks, type VaultLink } from './links.js';
import { obsidianUri } from './obsidian.js';
import { vaultFile } from './scope.js';

// What the reader shows of one vault item (CONTEXT.md, Vault reader): `mesa vault read`.

/** What Mesa can show of an item, by its kind; `unsupported` says why it shows none. */
export type VaultPreview =
  | { preview: 'markdown'; frontmatter: Frontmatter; body: string; links: VaultLink[] }
  | { preview: 'canvas'; nodes: number; edges: number; texts: string[]; canvas: CanvasData | null }
  | { preview: 'base'; yaml: string; views?: string[] }
  | { preview: 'unsupported'; reason: string };

export type VaultRead = VaultItem & {
  /** `obsidian://open` for this exact item. */
  uri: string;
  /** Every other Markdown item with a link that resolves to this one, by path. */
  backlinks: string[];
} & VaultPreview;

const UNSUPPORTED = {
  attachment: 'Mesa does not preview images, audio, video, or PDFs',
  other: 'Mesa previews only Markdown, canvases, and bases',
};

/** A note's frontmatter and body; frontmatter whose YAML does not parse leaves it all body. */
export function noteOf(text: string) {
  try {
    return parseNote(text);
  } catch {
    return { frontmatter: {}, body: text };
  }
}

/** A JSON Canvas file's node and edge counts and its text nodes' text. */
export function canvasOf(text: string): VaultPreview {
  try {
    const canvas = (text.trim() ? JSON.parse(text) : {}) as { nodes?: unknown; edges?: unknown };
    const nodes = Array.isArray(canvas.nodes)
      ? (canvas.nodes as { type?: unknown; text?: unknown }[])
      : [];
    const texts = nodes.flatMap((node) =>
      node?.type === 'text' && typeof node.text === 'string' ? [node.text] : [],
    );
    const edges = Array.isArray(canvas.edges) ? canvas.edges.length : 0;
    return { preview: 'canvas', nodes: nodes.length, edges, texts, canvas: parseCanvas(canvas) };
  } catch {
    return { preview: 'unsupported', reason: 'it is not a JSON Canvas file' };
  }
}

function previewOf(item: VaultItem, file: string, index: LinkIndex): VaultPreview {
  if (item.kind === 'attachment' || item.kind === 'other') {
    return { preview: 'unsupported', reason: UNSUPPORTED[item.kind] };
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { preview: 'unsupported', reason: 'the system does not let Mesa read it' };
  }
  if (item.kind === 'base') {
    const views = baseViews(text);
    return { preview: 'base', yaml: text, ...(views ? { views } : {}) };
  }
  if (item.kind === 'canvas') return canvasOf(text);
  const { frontmatter, body } = noteOf(text);
  return { preview: 'markdown', frontmatter, body, links: resolveLinks(index, item.path, body) };
}

/**
 * Every other Markdown item with a link that resolves to `path`. The inventory lists an item as
 * available only when it is in the vault's scope, so each is read where it is.
 * ponytail: reads and parses every Markdown item on each read, O(notes); an index of links kept
 * as notes change is the upgrade once a vault is too big for that.
 */
function backlinksOf(vault: string, items: VaultItem[], index: LinkIndex, path: string) {
  const linksHere = (note: VaultItem) => {
    let text: string;
    try {
      text = readFileSync(join(vault, note.path), 'utf8');
    } catch {
      return false;
    }
    const links = resolveLinks(index, note.path, noteOf(text).body);
    return links.some((link) => link.status === 'resolved' && link.path === path);
  };
  return items
    .filter((note) => note.kind === 'markdown' && !note.unavailable && note.path !== path)
    .filter(linksHere)
    .map((note) => note.path);
}

/**
 * One vault item as the reader shows it: the inventory's item, its exact Obsidian URI, its
 * backlinks, and its preview. Unreadable Markdown files keep an unsupported preview. Other
 * unavailable or out-of-scope paths are refused as usage; one it does not list is not_found.
 */
export function readVaultItem(vault: string, path: string): VaultRead {
  const file = vaultFile(vault, path);
  const at = relative(vault, file);
  const items = listVault(vault);
  const item = items.find((listed) => listed.path === at);
  if (!item) throw new MesaError('not_found', `no item at ${path} in ${vault}`);
  // Unreadable Markdown files keep their existing preview; unreadable folders still refuse.
  const unreadableNote =
    item.kind === 'markdown' &&
    item.unavailable === 'unreadable' &&
    statSync(file, { throwIfNoEntry: false })?.isFile();
  if (item.unavailable && !unreadableNote)
    throw new MesaError('usage', `vault path ${at} is ${item.unavailable}`);
  const index = linkIndex(items.map((listed) => listed.path));
  return {
    ...item,
    uri: obsidianUri(vault, at),
    backlinks: backlinksOf(vault, items, index, at),
    ...previewOf(item, file, index),
  };
}
