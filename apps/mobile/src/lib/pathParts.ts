/** A path as the folder it is in ('' at the top) and its name: the one place paths are split. */
export function pathParts(path: string) {
  const cut = path.lastIndexOf('/');
  return { folder: cut < 0 ? '' : path.slice(0, cut), name: path.slice(cut + 1) };
}
