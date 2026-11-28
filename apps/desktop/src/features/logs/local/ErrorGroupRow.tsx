import type { ErrorGroup } from '@mesa/core';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CopyButton } from '../shared/CopyButton';
import { ErrorGroupHeader } from '../shared/ErrorGroupHeader';
import { clockTime, type KeyedEntry } from '../shared/logLines';
import { LogEntryRow } from './LogEntryRow';
import type { RowActions } from './useRowActions';

/**
 * One group of identical errors in the Errors view (errorGroups): its title, how many, when the
 * last came; open, its entries under it.
 */
export function ErrorGroupRow(props: {
  group: ErrorGroup<KeyedEntry>;
  open: boolean;
  onOpen: (key: string) => void;
  picked: ReadonlySet<string>;
  actions: RowActions;
}) {
  const { group } = props;
  return (
    <div className="border-b border-l-2 border-b-border/60 border-l-state-failed/70">
      <ErrorGroupHeader
        title={group.title}
        open={props.open}
        onOpen={() => props.onOpen(group.key)}
        badges={
          <span className="shrink-0 rounded bg-state-failed/12 px-1.5 font-sans text-[11px] font-medium tabular-nums text-state-failed">
            x{group.count}
          </span>
        }
        trailing={
          <span className="shrink-0 font-sans text-[11px] text-muted-foreground tabular-nums">
            last {clockTime(group.last)}
          </span>
        }
        actions={
          <CopyButton
            onCopy={(format) => {
              const newest = group.entries.at(-1);
              if (newest) props.actions.onCopy(newest, format);
            }}
            extra={
              <DropdownMenuItem onSelect={() => props.actions.onCopyGroup(group)}>
                Copy summary
              </DropdownMenuItem>
            }
          />
        }
      />
      {props.open &&
        group.entries.map((entry) => (
          <LogEntryRow
            key={entry.key}
            entry={entry}
            selected={props.picked.has(entry.key)}
            actions={props.actions}
          />
        ))}
    </div>
  );
}
