import type { SourceId } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { SourceError } from './SourceError';
import { SourceTreeItem } from './SourceTreeItem';
import type { Picked } from './usePicked';
import { useSourceChildren } from './useSourceChildren';

/**
 * A node's children in the Picker's tree, loaded when shown, with Load more while the source has
 * more. A page always offers to open, so one with none opens on "Nothing here".
 */
export function SourceTreeChildren(props: {
  source: SourceId;
  node?: string;
  search?: string;
  depth: number;
  picker: Picked;
}) {
  const { source, depth } = props;
  const children = useSourceChildren(source, props.node, props.search);
  const indent = { paddingLeft: `${depth * 1.25 + 1.75}rem` };
  return (
    <ul>
      {children.children.map((child) => (
        <SourceTreeItem
          key={child.id}
          source={source}
          child={child}
          depth={depth}
          picker={props.picker}
        />
      ))}
      {children.error && (
        <li style={indent}>
          <SourceError source={source} error={children.error} onRetry={children.retry} />
        </li>
      )}
      {children.loading && (
        <li style={indent} className="py-1">
          <Muted>Loading...</Muted>
        </li>
      )}
      {!children.loading && !children.error && children.cursor && (
        <li style={indent}>
          <Button size="sm" variant="ghost" onClick={children.more}>
            Load more
          </Button>
        </li>
      )}
      {!children.loading && !children.error && !children.children.length && (
        <li style={indent} className="py-1">
          <Muted>{props.search ? 'Nothing found.' : 'Nothing here.'}</Muted>
        </li>
      )}
    </ul>
  );
}
