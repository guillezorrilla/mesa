import type { BrowseChild, SourceId } from '@mesa/core';
import {
  BookOpen,
  ChevronRight,
  CircleDot,
  FileText,
  FolderKanban,
  Globe,
  LibraryBig,
  type LucideIcon,
  SquareKanban,
} from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { SourceTreeChildren } from './SourceTreeChildren';
import { importable, type Picked } from './usePicked';

/** Each kind of node's icon; another kind's is a page's. */
const ICONS: Record<string, LucideIcon> = {
  site: Globe,
  confluence: BookOpen,
  space: LibraryBig,
  jira: SquareKanban,
  project: FolderKanban,
  issue: CircleDot,
};

/**
 * One node of the Picker's tree: a toggle that opens its children (loaded then), a checkbox when
 * an import takes it, and its title.
 */
export function SourceTreeItem(props: {
  source: SourceId;
  child: BrowseChild;
  depth: number;
  picker: Picked;
}) {
  const { child, depth, picker } = props;
  const [open, setOpen] = useState(false);
  const Icon = ICONS[child.kind] ?? FileText;
  return (
    <li data-testid="source-node">
      <div
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-sm hover:bg-accent/50"
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
      >
        {child.hasChildren ? (
          <button
            type="button"
            aria-label={`${open ? 'Close' : 'Open'} ${child.title}`}
            aria-expanded={open}
            className="rounded text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        {importable(child) && (
          <Checkbox
            aria-label={`Tick ${child.title}`}
            checked={picker.picked.has(child.id)}
            onCheckedChange={(on) => void picker.tick(child, on === true)}
          />
        )}
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate" title={child.url}>
          {child.title}
        </span>
      </div>
      {open && (
        <SourceTreeChildren
          source={props.source}
          node={child.id}
          depth={depth + 1}
          picker={picker}
        />
      )}
    </li>
  );
}
