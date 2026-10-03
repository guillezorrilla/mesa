import type { VaultItem, VaultKind } from '@mesa/core';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Link2Off,
  type LucideIcon,
  Network,
  Paperclip,
  Table2,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';

export const KIND_ICONS: Record<VaultKind, LucideIcon> = {
  markdown: FileText,
  canvas: Network,
  base: Table2,
  attachment: Paperclip,
  other: File,
};

type FolderNode = {
  path: string;
  name: string;
  count: number;
  folders: FolderNode[];
  items: VaultItem[];
};

/** The items as nested folders, each counting every item under it, in the items' own order. */
function foldersOf(items: readonly VaultItem[]): FolderNode {
  const root: FolderNode = { path: '', name: '', count: items.length, folders: [], items: [] };
  const byPath = new Map([['', root]]);
  for (const item of items) {
    const parts = item.path.split('/');
    let folder = root;
    for (let depth = 1; depth < parts.length; depth++) {
      const path = parts.slice(0, depth).join('/');
      let next = byPath.get(path);
      if (!next) {
        next = { path, name: parts[depth - 1] ?? path, count: 0, folders: [], items: [] };
        byPath.set(path, next);
        folder.folders.push(next);
      }
      next.count++;
      folder = next;
    }
    folder.items.push(item);
  }
  return root;
}

const ROW =
  'flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

/**
 * The inventory as a folder tree with a count on each folder. Only the top level shows at first:
 * every folder opens on its own, so a vault of thousands of items stays one screen. The selected
 * item's folders open with it.
 */
export function VaultTree(props: {
  items: readonly VaultItem[];
  selected?: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // A selection made elsewhere, such as a link in the reader, opens the folders it is in.
  useEffect(() => {
    const parts = props.selected?.split('/').slice(0, -1) ?? [];
    const folders = parts.map((_, depth) => parts.slice(0, depth + 1).join('/'));
    setOpen((last) =>
      folders.every((folder) => last.has(folder)) ? last : new Set([...last, ...folders]),
    );
  }, [props.selected]);
  const toggle = (path: string) =>
    setOpen((last) => {
      const next = new Set(last);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const indent = (depth: number) => ({ paddingLeft: `${depth * 12 + 8}px` });
  const rows = (folder: FolderNode, depth: number): ReactNode[] => [
    ...folder.folders.flatMap((child) => {
      const expanded = open.has(child.path);
      const Chevron = expanded ? ChevronDown : ChevronRight;
      const Icon = expanded ? FolderOpen : Folder;
      return [
        <button
          key={`folder:${child.path}`}
          type="button"
          data-testid="vault-folder"
          aria-expanded={expanded}
          aria-label={`${child.name}, ${child.count} ${child.count === 1 ? 'item' : 'items'}`}
          className={ROW}
          style={indent(depth)}
          onClick={() => toggle(child.path)}
        >
          <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{child.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{child.count}</span>
        </button>,
        ...(expanded ? rows(child, depth + 1) : []),
      ];
    }),
    ...folder.items.map((item) => {
      const Icon = item.unavailable ? Link2Off : KIND_ICONS[item.kind];
      return (
        <button
          key={item.path}
          type="button"
          data-testid="vault-file"
          data-kind={item.kind}
          aria-pressed={props.selected === item.path}
          title={item.unavailable ? `${item.path}: ${item.unavailable}` : item.path}
          className={cn(
            ROW,
            props.selected === item.path && 'bg-accent hover:bg-accent',
            item.unavailable && 'text-muted-foreground',
          )}
          // Files line up under their folder's name, past its chevron.
          style={indent(depth + 1.5)}
          onClick={() => props.onSelect(item.path)}
        >
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.path.split('/').at(-1)}</span>
          <span className="ml-auto text-[11px] text-muted-foreground/70">{item.kind}</span>
        </button>
      );
    }),
  ];
  return (
    <section aria-label="Vault tree" className="min-w-0 py-1">
      {rows(foldersOf(props.items), 0)}
      {props.items.length === 0 && (
        <Muted size="xs" className="p-2">
          No items.
        </Muted>
      )}
    </section>
  );
}
