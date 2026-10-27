import { nameOf } from '../gitChanges';
import type { DiffFile } from './diffFiles';

export type DiffTreeNode =
  | { kind: 'folder'; path: string; name: string; children: DiffTreeNode[] }
  | { kind: 'file'; file: DiffFile };

type Folder = { folders: Map<string, Folder>; files: DiffFile[] };

/**
 * A patch's files as a folder tree: in each folder its subfolders, then its files, each by name.
 * A folder holding only one subfolder is merged into it, as `src/features/git`.
 */
export function diffTree(files: readonly DiffFile[]): DiffTreeNode[] {
  const root: Folder = { folders: new Map(), files: [] };
  for (const file of files) {
    let folder = root;
    for (const part of file.path.split('/').slice(0, -1)) {
      const next = folder.folders.get(part) ?? { folders: new Map(), files: [] };
      folder.folders.set(part, next);
      folder = next;
    }
    folder.files.push(file);
  }
  const nodes = (folder: Folder, parent: string): DiffTreeNode[] => [
    ...[...folder.folders]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([part, sub]): DiffTreeNode => {
        let name = part;
        let inner = sub;
        for (let only = soleFolder(inner); only; only = soleFolder(inner)) {
          name = `${name}/${only[0]}`;
          inner = only[1];
        }
        const path = `${parent}${name}`;
        return { kind: 'folder', path, name, children: nodes(inner, `${path}/`) };
      }),
    ...folder.files
      .slice()
      .sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)))
      .map((file): DiffTreeNode => ({ kind: 'file', file })),
  ];
  return nodes(root, '');
}

/** A folder's one subfolder, when it holds nothing else. */
const soleFolder = (folder: Folder) =>
  folder.files.length === 0 && folder.folders.size === 1 ? [...folder.folders][0] : undefined;

/** The files in the order the tree shows them, for j and k. */
export const treeOrder = (nodes: readonly DiffTreeNode[]): DiffFile[] =>
  nodes.flatMap((node) => (node.kind === 'file' ? [node.file] : treeOrder(node.children)));
