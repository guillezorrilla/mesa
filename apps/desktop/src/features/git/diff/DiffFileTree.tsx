import { useState } from 'react';
import { TreeFolderRow } from '@/components/TreeFolderRow';
import { useToggleSet } from '@/lib/useToggleSet';
import { DiffFileRow } from './DiffFileRow';
import type { DiffTreeNode } from './diffTree';

/** A row's left padding at `depth`: a chevron's width a level, past the list's own 12px. */
const indent = (depth: number) => 12 + depth * 14;
/** A folder's chevron is wider than a file's status letter: it starts this far left of it. */
const CHEVRON_SHIFT = 4;

/**
 * The changed files' folder tree (diffTree) as list items. Each folder closes on a click; a file
 * opened inside a closed one (j or k landing there) opens the folders it is in.
 */
export function DiffFileTree(props: {
  tree: DiffTreeNode[];
  open: string;
  onOpen: (path: string) => void;
}) {
  const [closed, toggle, setClosed] = useToggleSet();
  // Set during render, not in an effect, so the list's focus effect finds the open file's row.
  const [shown, setShown] = useState(props.open);
  if (shown !== props.open) {
    setShown(props.open);
    setClosed(new Set([...closed].filter((folder) => !props.open.startsWith(`${folder}/`))));
  }
  const items = (nodes: DiffTreeNode[], depth: number) =>
    nodes.map((node) => {
      if (node.kind === 'file')
        return (
          <li key={node.file.path}>
            <DiffFileRow
              file={node.file}
              current={node.file.path === props.open}
              indent={indent(depth)}
              onOpen={props.onOpen}
            />
          </li>
        );
      const expanded = !closed.has(node.path);
      return (
        <li key={node.path}>
          <TreeFolderRow
            name={node.name}
            expanded={expanded}
            indent={indent(depth) - CHEVRON_SHIFT}
            title={node.path}
            className="py-1 pr-3 font-mono text-xs text-muted-foreground"
            onClick={() => toggle(node.path)}
          />
          {expanded && <ul>{items(node.children, depth + 1)}</ul>}
        </li>
      );
    });
  return <>{items(props.tree, 0)}</>;
}
