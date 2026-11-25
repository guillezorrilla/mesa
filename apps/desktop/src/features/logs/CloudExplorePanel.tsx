import type { CloudLogEntry } from '@mesa/core';
import { History, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { CloudFilters, CloudRead } from '@/lib/client/logs';
import { useCall } from '@/lib/useCommand';
import { CloudEntryRow } from './CloudEntryRow';
import { CloudLogsChart } from './CloudLogsChart';
import { CLOUD_RANGES, type CloudRange, facetsOf, serviceRef } from './cloudLines';

/**
 * Explore mode (CONTEXT.md, Cloud Logs): the page of entries the filters pick, newest first, with
 * Load older for the next page back; facet chips for the context fields the entries carry, a
 * click adding one as a filter; a chart of counts over time, from the log-based metric a view maps
 * to, else from the page with a note; and the list, whose trace ids filter to their trace.
 */
export function CloudExplorePanel(props: {
  read: CloudRead | undefined;
  busy: boolean;
  filters: CloudFilters;
  counts?: { start: string; count: number }[];
  focus?: string;
  onFilters: (filters: CloudFilters) => void;
}) {
  const call = useCall();
  // Older pages belong to the read they follow: a new read starts them over.
  const [pages, setPages] = useState<{ read?: CloudRead; entries: CloudLogEntry[] }>({
    entries: [],
  });
  const older = pages.read === props.read ? pages.entries : [];
  const [loading, setLoading] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!props.focus) return;
    [...(list.current?.querySelectorAll<HTMLElement>('[data-id]') ?? [])]
      .find((row) => row.dataset.id === props.focus)
      ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [props.focus]);
  const entries = useMemo(() => [...(props.read?.entries ?? []), ...older], [props.read, older]);
  const facets = useMemo(() => facetsOf(entries), [entries]);
  const services = useMemo(() => new Set(entries.map(serviceRef)).size > 1, [entries]);
  const range = CLOUD_RANGES[(props.filters.since ?? '1h') as CloudRange]?.[1] ?? 3_600_000;
  const loadOlder = async () => {
    const oldest = entries.at(-1)?.time;
    if (!oldest) return;
    setLoading(true);
    const page = await call('logs.gcp', { ...props.filters, before: oldest });
    setLoading(false);
    if (page.ok) setPages({ read: props.read, entries: [...older, ...page.data.entries] });
  };
  const setField = (key: string, value?: string) => {
    const fields = { ...props.filters.fields };
    if (value === undefined) delete fields[key];
    else fields[key] = value;
    props.onFilters({ ...props.filters, fields: Object.keys(fields).length ? fields : undefined });
  };
  return (
    <div className="grid min-w-0 content-start gap-3">
      <CloudLogsChart entries={entries} rangeMs={range} counts={props.counts} />
      {(facets.length > 0 || props.filters.fields || props.filters.trace) && (
        <fieldset className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Facets">
          {props.filters.trace && (
            <Chip
              label={`trace ${props.filters.trace.slice(0, 12)}`}
              on
              onClick={() => props.onFilters({ ...props.filters, trace: undefined })}
            />
          )}
          {Object.entries(props.filters.fields ?? {}).map(([key, value]) => (
            <Chip key={key} label={`${key} = ${value}`} on onClick={() => setField(key)} />
          ))}
          {facets
            .filter((facet) => !props.filters.fields?.[facet.key])
            .flatMap((facet) =>
              facet.values
                .slice(0, 3)
                .map((v) => (
                  <Chip
                    key={`${facet.key}=${v.value}`}
                    label={`${facet.key} = ${v.value}`}
                    count={v.count}
                    onClick={() => setField(facet.key, v.value)}
                  />
                )),
            )}
        </fieldset>
      )}
      <div className="max-h-[62vh] overflow-auto rounded-lg border bg-card py-1 font-mono text-[11.5px] leading-5">
        {!props.read ? (
          <Muted className="px-3 py-4 font-sans">{props.busy ? 'Reading' : 'No entries'}</Muted>
        ) : !entries.length ? (
          <Muted className="px-3 py-4 font-sans">No entries match these filters.</Muted>
        ) : (
          <>
            <ol ref={list} aria-label="Log entries" aria-busy={props.busy}>
              {entries.map((entry) => (
                <CloudEntryRow
                  key={`${entry.project} ${entry.id}`}
                  entry={entry}
                  cited={props.focus === entry.id}
                  focused={props.focus === entry.id}
                  services={services}
                  onTrace={(trace) => props.onFilters({ ...props.filters, trace })}
                  onField={(key, value) => setField(key, value)}
                  onRequest={(id) => props.onFilters({ ...props.filters, text: id })}
                />
              ))}
            </ol>
            <div className="flex justify-center py-2 font-sans">
              <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadOlder()}>
                <History aria-hidden /> {loading ? 'Reading older entries' : 'Load older'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A facet chip: on (a filter, its click removes it) or offered (its click adds it), with a count. */
function Chip(props: { label: string; count?: number; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.on ?? false}
      className="inline-flex max-w-72 items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:border-state-working aria-pressed:bg-state-working/10 aria-pressed:text-foreground"
      onClick={props.onClick}
    >
      <span className="truncate">{props.label}</span>
      {props.count !== undefined && <span className="tabular-nums opacity-70">{props.count}</span>}
      {props.on && <X aria-hidden className="size-3" />}
    </button>
  );
}
