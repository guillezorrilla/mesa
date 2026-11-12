/** A path in the checkout's tree, and whether it is a folder. */
export type TreeEntry = { path: string; dir: boolean };

/** The folder a path is in: '' for the checkout's top. */
export const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** What `folder` holds directly, folders first, each group by name. */
export const folderEntries = (entries: readonly TreeEntry[], folder: string) =>
  entries
    .filter((entry) => parentOf(entry.path) === folder)
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.path.localeCompare(b.path));

/** An entry's name within its folder. */
export const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
