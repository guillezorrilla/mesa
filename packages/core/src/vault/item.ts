import type { Frontmatter } from './frontmatter.js';
import { VAULT, VAULT_FOLDERS } from './layout.js';
import type { OutOfScope } from './scope.js';

// What one vault item is (CONTEXT.md, Vault inventory): its kind, category, and project, from its
// path and frontmatter alone. Pure, so the app reads the same rules through @mesa/core/browser.

export const VAULT_KINDS = ['markdown', 'canvas', 'base', 'attachment', 'other'] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];

export const VAULT_CATEGORIES = [...VAULT_FOLDERS, 'index', 'log', 'agents', 'user'] as const;
export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

/**
 * Why an item is listed but cannot be read: out of the vault's scope, a link to a folder (whose
 * items are listed where they are), or a folder or file the system does not let Mesa open.
 */
export type Unavailable = OutOfScope | 'a folder link' | 'unreadable';

export type VaultItem = {
  /** Vault-relative, `/`-separated. */
  path: string;
  kind: VaultKind;
  category: VaultCategory;
  project?: string;
  /** Bytes. */
  size: number;
  /** ISO time of its last change. */
  modified: string;
  unavailable?: Unavailable;
};

/** `type` is a kind or a category. */
export type VaultFilter = { project?: string; type?: string };

// Obsidian's attachment formats: images, audio, video, and PDF.
const ATTACHMENTS = new Set(
  (
    'avif bmp gif jpeg jpg png svg webp ' +
    '3gp flac m4a mp3 ogg wav ' +
    'mkv mov mp4 ogv webm ' +
    'pdf'
  ).split(' '),
);

/** A path's extension, lowercase, without its dot; none for a dotfile's name. */
const extension = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export function itemKind(path: string): VaultKind {
  const ext = extension(path);
  if (ext === 'md') return 'markdown';
  if (ext === 'canvas' || ext === 'base') return ext;
  return ATTACHMENTS.has(ext) ? 'attachment' : 'other';
}

const ROOT_NOTES: Record<string, VaultCategory> = {
  [VAULT.index]: 'index',
  [VAULT.log]: 'log',
  [VAULT.agents]: 'agents',
};

/** The layout folder an item is in, the layout note it is, or `user` for anything else. */
export function itemCategory(path: string): VaultCategory {
  const parts = path.split('/');
  const top = parts[0] ?? '';
  if (parts.length === 1) return ROOT_NOTES[top] ?? 'user';
  return (VAULT_FOLDERS as readonly string[]).includes(top) ? (top as VaultCategory) : 'user';
}

/**
 * The project an item belongs to: its frontmatter's `project:`, else `<name>` for
 * `projects/<name>.md` and for anything under `projects/<name>/`. The one membership rule for the
 * inventory, search, and project context.
 */
export function itemProject(path: string, frontmatter: Frontmatter = {}): string | undefined {
  if (typeof frontmatter.project === 'string' && frontmatter.project) return frontmatter.project;
  const [top, name, ...rest] = path.split('/');
  if (top !== VAULT.projects || !name) return undefined;
  if (rest.length) return name;
  return extension(name) === 'md' ? name.slice(0, -'.md'.length) : undefined;
}

/** Whether `item` is of the filter's project, and of its type (its kind or its category). */
export const matchesVaultFilter = (item: VaultItem, { project, type }: VaultFilter) =>
  (project === undefined || item.project === project) &&
  (type === undefined || item.kind === type || item.category === type);
