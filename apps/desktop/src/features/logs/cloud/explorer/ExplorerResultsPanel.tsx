import type { CloudLogEntry } from '@mesa/core';
import { occurrenceRuns } from '@mesa/core/browser';
import { History } from 'lucide-react';
import { useRef, useState } from 'react';
import { CenteredState } from '@/components/CenteredState';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { cn } from '@/lib/utils';
import { RepeatRun } from '../RepeatRun';
import type { EntryActions } from '../types';
import { useOlderEntries } from '../useOlderEntries';
import { CloudEntryRow } from './CloudEntryRow';
import { ExplorerChart } from './ExplorerChart';
import { useScrollToId } from './useScrollToId';

/**
 * The Explorer's results (CONTEXT.md, Cloud Logs): a histogram of the entries read (over the span
 * they cover), then the
 * entries newest first, identical repeats folded into one, a cited one marked and scrolled to, and
 * Load older for the next page back.
 */
export function ExplorerResultsPanel(props: {
  read: readonly CloudLogEntry[] | undefined;
  busy: boolean;
  filters: CloudFilters;
  selected: ReadonlySet<string>;
  cited: ReadonlySet<string>;
  focus?: string;
  /** The context fields pinned as columns. */
  columns: readonly string[];
  /** The query shown is not the one these entries were read with: they dim until Run. */
  stale?: boolean;
  actions: EntryActions;
}) {
  const older = useOlderEntries(props.read, props.filters);
  const [open, setOpen] = useState<string>();
  const list = useRef<HTMLDivElement>(null);
  useScrollToId(list, props.focus);
  const row = (entry: CloudLogEntry) => (
    <CloudEntryRow
      key={`${entry.project} ${entry.id}`}
      entry={entry}
      selected={props.selected.has(entry.id)}
      cited={props.cited.has(entry.id)}
      expanded={open === entry.id}
      columns={props.columns}
      onExpand={() => setOpen(open === entry.id ? undefined : entry.id)}
      actions={props.actions}
    />
  );
  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
      <ExplorerChart
        entries={older.entries}
        filters={props.filters}
        onOlder={older.end ? undefined : () => void older.loadOlder()}
        olderBusy={older.busy}
      />
      <div
        ref={list}
        className={cn(
          '@container min-h-0 overflow-y-auto rounded-lg border bg-card py-1 font-mono text-[11.5px] leading-5 transition-opacity',
          props.stale && 'opacity-50',
        )}
      >
        {!props.read ? (
          <CenteredState message={props.busy ? 'Reading' : 'Run a query to read entries.'} />
        ) : !older.entries.length ? (
          <CenteredState message="No entries match this query." />
        ) : (
          <>
            <ol aria-label="Log entries" aria-busy={props.busy}>
              {occurrenceRuns(older.entries).map((run) => (
                <RepeatRun
                  key={`${run.entries[0]?.project} ${run.entries[0]?.id}`}
                  {...run}
                  className="ml-[6.75rem]"
                  row={row}
                />
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
