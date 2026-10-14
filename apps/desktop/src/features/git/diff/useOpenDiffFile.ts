import { useState } from 'react';
import type { DiffFile } from './diffFiles';

/** Which of a patch's files is open (the first until one is picked), and stepping to the next or previous. */
export function useOpenDiffFile(files: DiffFile[]) {
  const [openPath, setOpenPath] = useState<string>();
  const at = Math.max(
    0,
    files.findIndex((file) => file.path === openPath),
  );
  const move = (step: -1 | 1) => {
    const next = files[at + step];
    if (next) setOpenPath(next.path);
  };
  return { at, file: files[at], open: setOpenPath, move };
}
