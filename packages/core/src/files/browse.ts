import { type Dirent, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Checkout } from '../git/checkout.js';
import { gitCommand } from '../git/command.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { readWorkspaceFile } from './editor.js';

const MAX_ENTRIES = 1500;
const MAX_RESULTS = 100;
const MAX_DEPTH = 12;

export type FileEntry = { path: string; kind: 'directory' | 'file'; depth: number };
export type FileTree = { checkout: Checkout; entries: FileEntry[]; truncated: boolean };
export type FileHit = { path: string; line: number; preview: string };
export type FileSearch = {
  checkout: Checkout;
  query: string;
  mode: 'name' | 'content';
  hits: FileHit[];
  truncated: boolean;
};

/** Folders Git ignores, such as node_modules: listed, never walked. Outside Git, none. */
export async function ignoredFolders(run: Runner, root: string): Promise<ReadonlySet<string>> {
  const listed = await gitCommand(run, root, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--directory',
    '-z',
  ]);
  if (!listed.ok) return new Set();
  return new Set(
    listed.stdout
      .split('\0')
      .filter((path) => path.endsWith('/'))
      .map((path) => path.slice(0, -1)),
  );
}

function walk(
  root: string,
  skip: ReadonlySet<string>,
  visit: (entry: FileEntry) => boolean,
): boolean {
  let count = 0;
  let incomplete = false;
  const folder = (relative: string, depth: number): boolean => {
    let children: Dirent[];
    try {
      children = readdirSync(join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (!relative) throw error;
      incomplete = true;
      return false;
    }
    children.sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    );
    for (const child of children) {
      if (
        child.name === '.git' ||
        child.isSymbolicLink() ||
        (!child.isFile() && !child.isDirectory())
      )
        continue;
      if (++count > MAX_ENTRIES) return true;
      const path = relative ? `${relative}/${child.name}` : child.name;
      const entry: FileEntry = { path, kind: child.isDirectory() ? 'directory' : 'file', depth };
      if (visit(entry)) return true;
      if (child.isDirectory() && !skip.has(path)) {
        if (depth < MAX_DEPTH && folder(path, depth + 1)) return true;
        if (depth >= MAX_DEPTH) incomplete = true;
      }
    }
    return false;
  };
  return folder('', 0) || incomplete;
}

/** A deterministic, bounded tree; symlinks and Git internals are never followed. */
export function fileTree(checkout: Checkout, skip: ReadonlySet<string>): FileTree {
  const entries: FileEntry[] = [];
  const truncated = walk(checkout.path, skip, (entry) => {
    entries.push(entry);
    return false;
  });
  return { checkout, entries, truncated };
}

/** Search is bounded by both visited entries and returned hits. */
export function searchFiles(
  checkout: Checkout,
  query: string,
  mode: 'name' | 'content',
  skip: ReadonlySet<string>,
): FileSearch {
  const term = query.trim().toLocaleLowerCase();
  if (!term) throw new MesaError('usage', 'search query is required');
  const hits: FileHit[] = [];
  const truncated = walk(checkout.path, skip, (entry) => {
    if (entry.kind !== 'file') return false;
    if (mode === 'name') {
      if (entry.path.toLocaleLowerCase().includes(term))
        hits.push({ path: entry.path, line: 1, preview: entry.path });
    } else {
      try {
        if (statSync(join(checkout.path, entry.path)).size > 64 * 1024) return false;
        const file = readWorkspaceFile(checkout, entry.path);
        for (const [index, line] of file.text.split('\n').entries()) {
          if (line.toLocaleLowerCase().includes(term)) {
            hits.push({ path: entry.path, line: index + 1, preview: line.slice(0, 240) });
            if (hits.length >= MAX_RESULTS) break;
          }
        }
      } catch (error) {
        if (!(error instanceof MesaError)) throw error;
      }
    }
    return hits.length >= MAX_RESULTS;
  });
  return { checkout, query, mode, hits, truncated };
}
