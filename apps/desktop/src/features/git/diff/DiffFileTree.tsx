import { TreeFolderRow } from '@/components/TreeFolderRow';
import { useToggleSet } from '@/lib/useToggleSet';
import { DiffFileRow } from './DiffFileRow';
import type { DiffTreeNode } from './diffTree';

/** A row's left padding at `depth`: a chevron's width a level, past the list's own 12px. */
const indent = (depth: number) => 12 + depth * 14;

/**
 * The changed files' folder tree (diffTree) as list items: each folder closes on a click, except
 * the open file's, which stays open so j and k never land on a hidden row.
 */
export function DiffFileTree(props: {
  tree: DiffTreeNode[];
  open: string;
  onOpen: (path: string) => void;
}) {
  const [closed, toggle] = useToggleSet();
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
      const expanded = !closed.has(node.path) || props.open.startsWith(`${node.path}/`);
      return (
        <li key={node.path}>
          <TreeFolderRow
            name={node.name}
            expanded={expanded}
            indent={indent(depth) - 4}
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
