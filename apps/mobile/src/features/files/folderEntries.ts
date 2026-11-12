import { pathParts } from '../../lib/pathParts';

/** A path in the checkout's tree, and whether it is a folder. */
export type TreeEntry = { path: string; dir: boolean };

/** What `folder` holds directly, folders first, each group by name. */
export const folderEntries = (entries: readonly TreeEntry[], folder: string) =>
  entries
    .filter((entry) => pathParts(entry.path).folder === folder)
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.path.localeCompare(b.path));
