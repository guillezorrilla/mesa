import type { FileTree as Tree } from '@mesa/core';
import { parseFileTarget } from '@mesa/core/browser';
import {
  Braces,
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileText,
  LocateFixed,
  type LucideIcon,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { type RefObject, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Input } from '@/components/ui/input';
import { CheckoutPicker } from '@/features/worktrees/CheckoutPicker';
import { cn } from '@/lib/utils';
import { moveListFocus } from './listKeys';

/** The tree's icon and tone for a file, by its extension. */
const FILE_ICONS: [RegExp, LucideIcon, string][] = [
  [/\.jsonc?$/i, Braces, 'text-state-waiting'],
  [/\.(md|mdx|txt)$/i, FileText, 'text-state-working'],
  [/\.(c|m)?[jt]sx?$/i, FileCode, 'text-state-working'],
];
const fileIcon = (path: string): [LucideIcon, string] => {
  const [, icon, tone] = FILE_ICONS.find(([pattern]) => pattern.test(path)) ?? [];
  return icon && tone ? [icon, tone] : [File, 'text-muted-foreground'];
};
const ancestors = (path: string) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join('/'));

/**
 * The checkout's folders, closed until opened, as Xirp shows them. Typing in the field filters to
 * matching files; Enter opens `path:line`, or else the first match.
 */
export function FileTree(props: {
  project: string;
  checkout: string;
  onCheckout: (path: string) => void;
  tree?: Tree;
  busy: boolean;
  openedPath?: string;
  createDisabled: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onOpen: (target: { path: string; line?: number }) => void;
  goToRef: RefObject<HTMLInputElement | null>;
  /** The profile's file tree text size in px. */
  fontSize: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [goTo, setGoTo] = useState('');
  const filter = goTo.trim().toLowerCase();
  const visible =
    props.tree?.entries.filter((entry) =>
      filter
        ? entry.kind === 'file' && entry.path.toLowerCase().includes(filter)
        : ancestors(entry.path).every((folder) => expanded.has(folder)),
    ) ?? [];
  const jump = () => {
    const target = parseFileTarget(goTo);
    const first = visible[0];
    // Unfiltered, the first row can be a folder: only a filtered list is all files.
    if (filter && !goTo.includes(':') && first) props.onOpen({ path: first.path });
    else if (target) props.onOpen(target);
  };
  const toggle = (path: string) =>
    setExpanded((last) => {
      const next = new Set(last);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5 px-3 pt-2">
        <SectionLabel className="flex-1">Files</SectionLabel>
        <IconButton
          label="Reveal open file"
          icon={LocateFixed}
          disabled={!props.openedPath}
          onClick={() => {
            const path = props.openedPath;
            if (path) setExpanded((last) => new Set([...last, ...ancestors(path)]));
          }}
        />
        <CheckoutPicker
          project={props.project}
          label="Files checkout"
          value={props.checkout}
          onChange={props.onCheckout}
        />
        <IconButton
          label="Create file"
          icon={Plus}
          disabled={props.createDisabled}
          onClick={props.onCreate}
        />
        <IconButton label="Refresh files" icon={RefreshCw} onClick={props.onRefresh} />
      </div>
      <form
        className="shrink-0 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          jump();
        }}
      >
        <Input
          ref={props.goToRef}
          aria-label="Go to file and line"
          className="h-8 border-0 bg-background font-mono text-xs dark:bg-background"
          value={goTo}
          onChange={(event) => setGoTo(event.target.value)}
          placeholder="Search..."
        />
      </form>
      <section
        className="min-h-0 flex-1 overflow-auto px-2 pb-2"
        style={{ fontSize: props.fontSize }}
        aria-label="File tree"
      >
        {visible.map((entry) => {
          const folder = entry.kind === 'directory';
          const [Icon, tone] = folder
            ? [expanded.has(entry.path) ? ChevronDown : ChevronRight, 'text-muted-foreground']
            : fileIcon(entry.path);
          return (
            <button
              key={entry.path}
              data-file-row
              type="button"
              onKeyDown={moveListFocus}
              aria-current={props.openedPath === entry.path || undefined}
              title={entry.path}
              className="flex w-full items-center gap-1.5 rounded-md border border-transparent py-1 pr-2 text-left font-mono hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:border-state-working/60 aria-[current=true]:bg-accent"
              style={{ paddingLeft: `${filter ? 8 : entry.depth * 16 + 8}px` }}
              onClick={() => (folder ? toggle(entry.path) : props.onOpen({ path: entry.path }))}
            >
              <Icon aria-hidden className={cn('size-4 shrink-0', tone)} />
              <span className="truncate">{filter ? entry.path : entry.path.split('/').at(-1)}</span>
            </button>
          );
        })}
        {props.tree?.truncated && (
          <Muted size="xs" className="p-2">
            Tree limited to 1,500 entries.
          </Muted>
        )}
        {!visible.length && !props.busy && (
          <Muted size="xs" className="p-2">
            No files found.
          </Muted>
        )}
      </section>
    </>
  );
}
