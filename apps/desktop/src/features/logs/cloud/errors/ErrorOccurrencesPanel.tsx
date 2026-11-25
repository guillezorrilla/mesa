import type { CloudErrorGroup, CloudLogEntry } from '@mesa/core';
import { groupQuery, occurrenceRuns } from '@mesa/core/browser';
import { ScanSearch } from 'lucide-react';
import { useMemo } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { clockTime, dayTime } from '../../shared/logLines';
import { MessagePanel } from '../MessagePanel';
import { RepeatRun } from '../RepeatRun';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { useOlderEntries } from '../useOlderEntries';

/** How many occurrences each read brings. */
const PAGE = 50;

/**
 * The Logging read of `group`'s occurrences: its project and the terms each of its messages holds
 * (groupQuery), so the query finds its own group.
 */
function occurrenceFilters(
  group: CloudErrorGroup,
  filters: CloudFilters,
  config: { service?: string } | undefined,
): CloudFilters {
  // The range, env and noise switch stay; the group's own query replaces every other filter.
  return {
    env: filters.env,
    since: filters.since,
    all: filters.all,
    projects: [group.project],
    filter: groupQuery(group, config),
  };
}

/** One occurrence: its time and its message (MessagePanel). */
function Occurrence(props: { entry: CloudLogEntry }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground tabular-nums">{clockTime(props.entry.time)}</span>
      <MessagePanel message={props.entry.message} />
    </div>
  );
}

/**
 * An error group's occurrences (CONTEXT.md, Cloud Logs): read from Logging with the group's filter
 * (occurrenceFilters), newest first, identical neighbours as one run (RepeatRun), "Showing n of
 * count", Load older for the next 50 before the oldest shown (useOlderEntries), and Open all in
 * Explorer.
 */
export function ErrorOccurrencesPanel(props: {
  group: CloudErrorGroup;
  filters: CloudFilters;
  onExplore: () => void;
}) {
  const { gcp } = useCloudLogsConfig();
  const query = useMemo(
    () => ({ ...occurrenceFilters(props.group, props.filters, gcp), limit: PAGE }),
    [props.group, props.filters, gcp],
  );
  const first = useOptional('logs.gcp', query);
  const older = useOlderEntries(first.data?.entries, query, PAGE);
  const runs = useMemo(() => occurrenceRuns(older.entries), [older.entries]);
  if (!older.entries.length)
    return (
      <Muted size="xs">
        {first.busy ? 'Reading occurrences' : 'No occurrences read in this range'}
      </Muted>
    );
  return (
    <div className="grid gap-2">
      <ol aria-label="Occurrences" className="grid gap-2 font-mono text-[11.5px] leading-5">
        {runs.map((run) => (
          <RepeatRun
            key={run.entries[0]?.id}
            {...run}
            className="ml-[4.75rem]"
            row={(entry) => <Occurrence key={entry.id} entry={entry} />}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 font-sans">
        <Muted size="xs">
          Showing {older.entries.length.toLocaleString()} of {props.group.count.toLocaleString()},
          back to {dayTime(older.entries.at(-1)?.time ?? null)}
        </Muted>
        {!older.end && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={older.busy}
            onClick={() => void older.loadOlder()}
          >
            {older.busy ? 'Reading' : 'Load older'}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7" onClick={props.onExplore}>
          <ScanSearch aria-hidden /> Open all in Explorer
        </Button>
      </div>
    </div>
  );
}
