import type { GitChange } from '@mesa/core';

/** A change as one list shows it: staged rows read the index column, the others the work tree. */
export type GitEntry = { change: GitChange; staged: boolean; code: string };
export type GitSection = {
  title: 'Staged' | 'Changes';
  entries: GitEntry[];
  action: 'stage' | 'unstage';
};
/** Which row is open: a path can be listed twice, once staged and once not. */
export type GitSelection = { path: string; staged: boolean };

/** The glyph and tone for a porcelain status letter. */
const GLYPH: Record<string, [string, string]> = {
  M: ['~', 'text-state-waiting'],
  A: ['+', 'text-state-idle'],
  D: ['-', 'text-state-failed'],
  R: ['>', 'text-state-working'],
  C: ['>', 'text-state-working'],
  '?': ['?', 'text-muted-foreground'],
};
export const glyph = (code: string): [string, string] =>
  GLYPH[code] ?? [code, 'text-muted-foreground'];

export const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
export const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const isSelected = (entry: GitEntry, selected?: GitSelection) =>
  entry.change.path === selected?.path && entry.staged === selected.staged;

/** The non-empty Staged and Changes sections of the changes whose path holds `filter`. */
export function gitSections(changes: readonly GitChange[], filter: string): GitSection[] {
  const wanted = changes.filter((change) =>
    change.path.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  return [
    {
      title: 'Staged' as const,
      action: 'unstage' as const,
      entries: wanted
        .filter((change) => change.index !== ' ' && change.index !== '?')
        .map((change) => ({ change, staged: true, code: change.index })),
    },
    {
      title: 'Changes' as const,
      action: 'stage' as const,
      entries: wanted
        .filter((change) => change.workingTree !== ' ')
        .map((change) => ({ change, staged: false, code: change.workingTree })),
    },
  ].filter((section) => section.entries.length);
}

/** Entries grouped by folder, root files first, each group sorted by path. */
export function byFolder(entries: readonly GitEntry[]): [string, GitEntry[]][] {
  const folders = new Map<string, GitEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.change.path.localeCompare(b.change.path))) {
    const folder = folderOf(entry.change.path);
    folders.set(folder, [...(folders.get(folder) ?? []), entry]);
  }
  return [...folders].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
}

/** Every entry in the order the list shows it, for previous and next. */
export const listOrder = (sections: readonly GitSection[]) =>
  sections.flatMap((section) => byFolder(section.entries).flatMap(([, entries]) => entries));
