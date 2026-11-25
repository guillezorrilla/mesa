import type { ErrorGroup } from '@mesa/core';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogEntryRow, type RowActions } from './LogEntryRow';
import { clockTime, type KeyedEntry } from './logLines';

/**
 * One group of identical errors in the Errors view (errorGroups): its title, how many, when the
 * last came; open, its entries under it.
 */
export function ErrorGroupRow(
  props: {
    group: ErrorGroup<KeyedEntry>;
    open: boolean;
    onOpen: (key: string) => void;
    picked: ReadonlySet<string>;
  } & RowActions,
) {
  const { group } = props;
  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        aria-expanded={props.open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
        onClick={() => props.onOpen(group.key)}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            props.open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-state-failed" title={group.title}>
          {group.title}
        </span>
        <span className="shrink-0 rounded bg-state-failed/12 px-1.5 font-sans text-[11px] font-medium tabular-nums text-state-failed">
          x{group.count}
        </span>
        <span className="shrink-0 font-sans text-[11px] text-muted-foreground tabular-nums">
          last {clockTime(group.last)}
        </span>
      </button>
      {props.open &&
        group.entries.map((entry) => (
          <LogEntryRow
            key={entry.key}
            entry={entry}
            selected={props.picked.has(entry.key)}
            onToggle={props.onToggle}
            onRequest={props.onRequest}
            onMute={props.onMute}
          />
        ))}
    </div>
  );
}
