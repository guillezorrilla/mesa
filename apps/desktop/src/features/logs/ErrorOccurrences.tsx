import type { CloudErrorGroup, CloudLogEntry } from '@mesa/core';
import { groupText, occurrenceRuns, splitMessage } from '@mesa/core/browser';
import { ChevronRight, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { useCall, useOptional } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { MessageText } from './LogEntryRow';
import { LogStack } from './LogStack';
import { clockTime, dayTime } from './logLines';

/** How many occurrences each read brings. */
const PAGE = 50;

/** The Logging read of `group`'s occurrences: its project, services and text, errors only. */
export function occurrenceFilters(group: CloudErrorGroup, filters: CloudFilters): CloudFilters {
  const text = groupText(group.message);
  return {
    ...filters,
    projects: [group.project],
    services: group.services.map((service) => `${group.project}/${service}`),
    severity: 'error',
    ...(text ? { text } : {}),
  };
}

/** An occurrence's message, its stack folded under it as a Logs panel row folds one (LogStack). */
function Folded(props: { message: string }) {
  const { head, stack } = splitMessage(props.message);
  return (
    <div className="min-w-0">
      <MessageText message={head} onRequest={() => {}} />
      {stack && <LogStack stack={stack} />}
    </div>
  );
}

/** One run of identical occurrences: a row, or with several, "x10 between" and the rest on click. */
function RunRow(props: { entries: CloudLogEntry[]; newest: string; oldest: string }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = props.entries;
  if (!first) return null;
  return (
    <li className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground tabular-nums">{clockTime(first.time)}</span>
      <div className="grid min-w-0 gap-1">
        <Folded message={first.message} />
        {rest.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            className="flex items-center gap-1 justify-self-start font-sans text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-3 transition-transform', open && 'rotate-90')}
            />
            x{props.entries.length} between {clockTime(props.oldest)} and {clockTime(props.newest)}
          </button>
        )}
        {open && (
          <ol className="grid gap-1 border-l pl-2">
            {rest.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2">
                <span className="text-muted-foreground tabular-nums">{clockTime(entry.time)}</span>
                <span className="truncate">{splitMessage(entry.message).head}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

/**
 * An error group's occurrences (CONTEXT.md, Cloud Logs): read from Logging with the group's filter
 * (occurrenceFilters), newest first, identical neighbours as one run, "Showing n of count", Load
 * older for the next 50 before the oldest shown, and Open all in Explore.
 */
export function ErrorOccurrences(props: {
  group: CloudErrorGroup;
  filters: CloudFilters;
  onExplore: (query: CloudFilters) => void;
}) {
  const query = occurrenceFilters(props.group, props.filters);
  const first = useOptional('logs.gcp', { ...query, limit: PAGE });
  const call = useCall();
  const [older, setOlder] = useState<CloudLogEntry[]>([]);
  const [end, setEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const entries = [...(first.data?.entries ?? []), ...older];
  const loadOlder = async () => {
    const before = entries.at(-1)?.time;
    if (!before) return;
    setBusy(true);
    const next = await call('logs.gcp', { ...query, before, limit: PAGE });
    setBusy(false);
    if (!next.ok) return;
    setOlder((now) => [...now, ...next.data.entries]);
    if (next.data.entries.length < PAGE) setEnd(true);
  };
  if (!entries.length)
    return (
      <Muted size="xs">
        {first.busy ? 'Reading occurrences' : 'No occurrences read in this range'}
      </Muted>
    );
  const more = !end && (first.data?.entries.length ?? 0) >= PAGE;
  return (
    <div className="grid gap-2">
      <ol aria-label="Occurrences" className="grid gap-2 font-mono text-[11.5px] leading-5">
        {occurrenceRuns(entries).map((run) => (
          <RunRow key={run.entries[0]?.id} {...run} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 font-sans">
        <Muted size="xs">
          Showing {entries.length.toLocaleString()} of {props.group.count.toLocaleString()}
          {entries.length ? `, back to ${dayTime(entries.at(-1)?.time ?? null)}` : ''}
        </Muted>
        {more && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={busy}
            onClick={() => void loadOlder()}
          >
            {busy ? 'Reading' : 'Load older'}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7" onClick={() => props.onExplore(query)}>
          <ScanSearch aria-hidden /> Open all in Explore
        </Button>
      </div>
    </div>
  );
}
