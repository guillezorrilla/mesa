import { type KeyboardEvent, useState } from 'react';
import type { DiffFile } from './diffFiles';
import type { DiffLayout } from './GitDiffRows';

/**
 * How a patch's files are viewed: which one is open (the first until one is picked), whether the
 * file list shows, inline or side by side, and j and k stepping to the next or previous file.
 */
export function useDiffView(files: DiffFile[]) {
  const [openPath, setOpenPath] = useState<string>();
  const [list, setList] = useState(true);
  const [layout, setLayout] = useState<DiffLayout>('inline');
  const at = Math.max(
    0,
    files.findIndex((file) => file.path === openPath),
  );
  const move = (step: -1 | 1) => {
    const next = files[at + step];
    if (next) setOpenPath(next.path);
  };
  return {
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
