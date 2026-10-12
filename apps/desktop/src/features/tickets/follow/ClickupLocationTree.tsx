import type { ClickupList, ClickupWorkspace } from '@mesa/core';
import { ChevronRight, Folder, List } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { clickupHex } from '../clickup/ClickupStatus';

/** A List, Folder or Space a ClickUp view follows, with what the view is named after and where it is. */
export type ClickupLocation = {
  workspace: string;
  kind: 'list' | 'folder' | 'space';
  id: string;
  name: string;
};

type Node = ClickupLocation & {
  children: Node[];
  tasks?: number;
  color?: string;
  /** How many Lists it holds, before a search narrows its children. */
  lists?: number;
};

/** The workspaces as one tree of Spaces, Folders and Lists. */
const nodesOf = (workspaces: readonly ClickupWorkspace[]) =>
  workspaces.map((w) => ({
    name: w.name,
    nodes: w.spaces.map(
      (s): Node => ({
        workspace: w.id,
        kind: 'space',
        id: s.id,
        name: s.name,
        ...(s.color ? { color: s.color } : {}),
        children: [
          ...s.folders.map(
            (f): Node => ({
              workspace: w.id,
              kind: 'folder',
              id: f.id,
              name: f.name,
              children: f.lists.map((l) => listNode(w.id, l)),
            }),
          ),
          ...s.lists.map((l) => listNode(w.id, l)),
        ],
      }),
    ),
  }));
const listNode = (workspace: string, l: ClickupList): Node => ({
  workspace,
  kind: 'list',
  id: l.id,
  name: l.name,
  children: [],
  ...(l.tasks === undefined ? {} : { tasks: l.tasks }),
});
const lists = (node: Node): number =>
  node.lists ?? (node.kind === 'list' ? 1 : node.children.reduce((sum, c) => sum + lists(c), 0));
const keyOf = (node: Pick<Node, 'kind' | 'id'>) => `${node.kind}:${node.id}`;
const locationOf = ({ workspace, kind, id, name }: Node): ClickupLocation => ({
  workspace,
  kind,
  id,
  name,
});

/** `nodes` holding a name with `words`, each with the path down to it; every node when none. */
function matching(nodes: Node[], words: string): Node[] {
  if (!words) return nodes;
  return nodes.flatMap((node) => {
    if (node.name.toLowerCase().includes(words)) return [node];
    const children = matching(node.children, words);
    return children.length ? [{ ...node, children, lists: lists(node) }] : [];
  });
}

/** The first List in `nodes`, and the Space and Folder above it, which the tree opens on. */
function firstList(nodes: Node[], above: Node[] = []): Node[] | undefined {
  for (const node of nodes) {
    if (node.kind === 'list') return [...above, node];
    const found = firstList(node.children, [...above, node]);
    if (found) return found;
  }
  return undefined;
}

/**
 * ClickUp's Follow dialog Location step: each Workspace's Spaces, Folders and Lists as a tree
 * with a search, the first List picked at first; a Space or Folder follows every List inside it.
 */
export function ClickupLocationTree(props: {
  workspaces: readonly ClickupWorkspace[];
  picked: ClickupLocation | undefined;
  onPick: (location: ClickupLocation) => void;
}) {
  const { picked, onPick } = props;
  const trees = nodesOf(props.workspaces);
  const path = firstList(trees.flatMap((t) => t.nodes)) ?? [];
  const first = path.at(-1);
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(path.slice(0, -1).map(keyOf)),
  );
  useEffect(() => {
    if (!picked && first) onPick(locationOf(first));
  }, [picked, first, onPick]);
  const [search, setSearch] = useState('');
  const words = search.trim().toLowerCase();
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const row = (node: Node, depth: number) => {
    const key = keyOf(node);
    const expanded = node.children.length > 0 && (Boolean(words) || open.has(key));
    const selected = picked !== undefined && keyOf(picked) === key;
    const count = node.kind === 'list' ? node.tasks : lists(node);
    return (
      <div key={key}>
        <div
          role="treeitem"
          tabIndex={-1}
          aria-selected={selected}
          aria-expanded={node.children.length ? expanded : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm hover:bg-accent/60',
            selected && 'bg-accent shadow-[inset_2px_0_0_var(--tracker-clickup)]',
          )}
          style={{ paddingLeft: `${8 + depth * 18}px` }}
        >
          {node.children.length ? (
            <button
              type="button"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
              className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted"
              onClick={() => toggle(key)}
            >
              <ChevronRight
                aria-hidden
                className={cn('size-3 transition-transform', expanded && 'rotate-90')}
              />
            </button>
          ) : (
            <span className="size-4" />
          )}
          <button
            type="button"
            data-testid="clickup-node"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => onPick(locationOf(node))}
          >
            {node.kind === 'space' ? (
              <span
                aria-hidden
                style={{ backgroundColor: clickupHex(node.color) }}
                className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-tracker-clickup text-[10px] font-semibold text-white"
              >
                {node.name[0]?.toUpperCase()}
              </span>
            ) : node.kind === 'folder' ? (
              <Folder aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <List aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
            {node.kind !== 'list' && (
              <span className="ml-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                {node.kind}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {node.kind === 'list' ? count : `${count} List${count === 1 ? '' : 's'}`}
            </span>
          </button>
        </div>
        {expanded && node.children.map((child) => row(child, depth + 1))}
      </div>
    );
  };
  const shown = trees.map((t) => ({ ...t, nodes: matching(t.nodes, words) }));
  return (
    <div className="grid gap-1.5">
      <Input
        type="search"
        placeholder="Search Spaces, Folders and Lists"
        aria-label="Search Spaces, Folders and Lists"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        role="tree"
        aria-label="Spaces, Folders and Lists"
        className="max-h-56 overflow-auto rounded-lg border p-1"
      >
        {shown.map((tree) => (
          <div key={tree.name}>
            {shown.length > 1 && (
              <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{tree.name}</p>
            )}
            {tree.nodes.map((node) => row(node, 0))}
          </div>
        ))}
        {shown.every((t) => !t.nodes.length) && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {words ? 'Nothing matches.' : 'No Spaces yet.'}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        A Space or Folder follows every List inside it.
      </span>
    </div>
  );
}
