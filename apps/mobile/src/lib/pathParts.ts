/** A path as its folder and its name, so a list can dim the one and set the other in bold. */
export function pathParts(path: string) {
  const cut = path.lastIndexOf('/');
  return { folder: cut < 0 ? '' : path.slice(0, cut + 1), name: path.slice(cut + 1) };
}
