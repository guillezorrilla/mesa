import { type KeyboardEvent, useMemo, useState } from 'react';
import { useKept } from '@/lib/keptValue';
import type { DiffFile } from './diffFiles';
import { diffTree, treeOrder } from './diffTree';
import type { DiffLayout } from './GitDiffRows';

/**
 * How a patch's files are viewed: which one is open (the first until one is picked), whether the
 * file list shows, as a folder tree (kept, the default) or flat, inline or side by side, and j and
 * k stepping to the next or previous file in the order the list shows them.
 */
export function useDiffView(patch: DiffFile[]) {
  const [openPath, setOpenPath] = useState<string>();
  const [list, setList] = useState(true);
  const [layout, setLayout] = useState<DiffLayout>('inline');
  const [kept, keep] = useKept('mesa.diff.files');
  const flat = kept === 'list';
  const tree = useMemo(() => (flat ? undefined : diffTree(patch)), [flat, patch]);
  const files = useMemo(() => (tree ? treeOrder(tree) : patch), [tree, patch]);
  const at = Math.max(
    0,
    files.findIndex((file) => file.path === openPath),
  );
  const move = (step: -1 | 1) => {
    const next = files[at + step];
    if (next) setOpenPath(next.path);
  };
  return {
    /** The files in the list's order. */
    files,
    /** The folder tree the list shows; none while it is flat. */
    tree,
    toggleTree: () => keep(flat ? undefined : 'list'),
    at,
    file: files[at],
    open: setOpenPath,
    move,
    list,
    toggleList: () => setList(!list),
    layout,
    setLayout,
    /** Steps through the files on j or k, outside a text field; true when it did. */
    walk: (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return false;
      if (event.key !== 'j' && event.key !== 'k') return false;
      event.preventDefault();
      move(event.key === 'j' ? 1 : -1);
      return true;
    },
  };
}

export type DiffView = ReturnType<typeof useDiffView>;
