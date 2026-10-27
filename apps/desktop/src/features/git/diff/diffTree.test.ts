import { expect, test } from 'vitest';
import type { DiffFile } from './diffFiles';
import { type DiffTreeNode, diffTree, treeOrder } from './diffTree';

const file = (path: string): DiffFile => ({ path, status: 'M', added: 1, removed: 0, rows: [] });
/** A tree as `name/` for a folder over its indented children, and a file's name. */
const outline = (nodes: DiffTreeNode[], depth = 0): string[] =>
  nodes.flatMap((node) =>
    node.kind === 'file'
      ? [`${'  '.repeat(depth)}${node.file.path.split('/').at(-1)}`]
      : [`${'  '.repeat(depth)}${node.name}/`, ...outline(node.children, depth + 1)],
  );

test('files nest by folder, subfolders before files, and a lone subfolder merges into its parent', () => {
  const tree = diffTree(
    [
      'README.md',
      'apps/desktop/src/features/git/diff/diffTree.ts',
      'apps/desktop/src/features/git/diff/DiffFileList.tsx',
      'apps/desktop/src/features/git/gitChanges.ts',
      'apps/desktop/src/features/sessions/dialogs/RemoveDialog.tsx',
      'packages/core/src/sessions/board/board.ts',
    ].map(file),
  );
  expect(outline(tree)).toEqual([
    'apps/desktop/src/features/',
    '  git/',
    '    diff/',
    '      DiffFileList.tsx',
    '      diffTree.ts',
    '    gitChanges.ts',
    '  sessions/dialogs/',
    '    RemoveDialog.tsx',
    'packages/core/src/sessions/board/',
    '  board.ts',
    'README.md',
  ]);
  expect(tree[0]).toMatchObject({ kind: 'folder', path: 'apps/desktop/src/features' });
  expect(tree[0]?.kind === 'folder' && tree[0].children[1]).toMatchObject({
    path: 'apps/desktop/src/features/sessions/dialogs',
  });
  expect(treeOrder(tree).map((f) => f.path.split('/').at(-1))).toEqual([
    'DiffFileList.tsx',
    'diffTree.ts',
    'gitChanges.ts',
    'RemoveDialog.tsx',
    'board.ts',
    'README.md',
  ]);
});
