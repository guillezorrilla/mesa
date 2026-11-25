import type { CloudLogEntry } from '@mesa/core';
import { occurrenceRuns } from '@mesa/core/browser';
import { ChevronRight, History } from 'lucide-react';
import { useRef, useState } from 'react';
import { CenteredState } from '@/components/CenteredState';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { cn } from '@/lib/utils';
import { clockTime } from '../shared/logLines';
import { CloudEntryRow } from './CloudEntryRow';
import { ExplorerChart } from './ExplorerChart';
import type { EntryActions } from './types';
import { useOlderEntries } from './useOlderEntries';
import { useScrollToId } from './useScrollToId';

/** A run of identical entries: its newest, then "x10 between" opening the rest. */
function Run(props: {
  entries: CloudLogEntry[];
  newest: string;
  oldest: string;
  row: (entry: CloudLogEntry) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = props.entries;
  if (!first) return null;
  return (
    <li>
      {props.row(first)}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            className="ml-[6.75rem] flex items-center gap-1 py-0.5 font-sans text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-3 transition-transform', open && 'rotate-90')}
            />
            x{props.entries.length} between {clockTime(props.oldest)} and {clockTime(props.newest)}
          </button>
          {open && <div className="border-l-2 border-muted">{rest.map(props.row)}</div>}
        </>
      )}
    </li>
  );
}

/**
 * The Explorer's results (CONTEXT.md, Cloud Logs): a histogram of the entries read, then the
 * entries newest first, identical repeats folded into one, a cited one marked and scrolled to, and
 * Load older for the next page back.
 */
export function ExplorerResults(props: {
  read: readonly CloudLogEntry[] | undefined;
  busy: boolean;
  filters: CloudFilters;
  selected: ReadonlySet<string>;
  cited: ReadonlySet<string>;
  focus?: string;
  actions: EntryActions;
}) {
  const older = useOlderEntries(props.read, props.filters);
  const [open, setOpen] = useState<string>();
  const list = useRef<HTMLDivElement>(null);
  useScrollToId(list, props.focus);
  const actions = {
    ...props.actions,
    onExpand: (entry: CloudLogEntry) => setOpen(open === entry.id ? undefined : entry.id),
  };
  const row = (entry: CloudLogEntry) => (
    <CloudEntryRow
      key={`${entry.project} ${entry.id}`}
      entry={entry}
      selected={props.selected.has(entry.id)}
      cited={props.cited.has(entry.id)}
      expanded={open === entry.id}
      actions={actions}
    />
  );
  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
      <ExplorerChart entries={older.entries} filters={props.filters} />
      <div
        ref={list}
        className="@container min-h-0 overflow-y-auto rounded-lg border bg-card py-1 font-mono text-[11.5px] leading-5"
      >
        {!props.read ? (
          <CenteredState message={props.busy ? 'Reading' : 'Run a query to read entries.'} />
        ) : !older.entries.length ? (
          <CenteredState message="No entries match this query." />
        ) : (
          <>
            <ol aria-label="Log entries" aria-busy={props.busy}>
              {occurrenceRuns(older.entries).map((run) => (
                <Run key={`${run.entries[0]?.project} ${run.entries[0]?.id}`} {...run} row={row} />
              ))}
            </ol>
            {!older.end && (
              <div className="flex justify-center py-2 font-sans">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={older.busy}
                  onClick={() => void older.loadOlder()}
                >
                  <History aria-hidden /> {older.busy ? 'Reading older entries' : 'Load older'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
