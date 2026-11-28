import type { LogSource } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useKept } from '@/lib/keptValue';
import { useCall } from '@/lib/useCommand';
import { useWindowFocused } from '@/lib/useWindowFocused';
import { type KeyedEntry, keyed, LEVEL_FILTERS, type LevelFilter } from '../shared/logLines';

/** How often the open panel reads its source while Live. */
export const LOGS_POLL_MS = 2_000;
/** How often a closed panel reads it, for the red dot only. */
export const CLOSED_POLL_MS = 10_000;
/** How many entries a read brings back. */
const TAIL = 500;

/**
 * The Logs panel's stream for the selected session's project (CONTEXT.md, Logs panel): its sources,
 * the source picked (kept per project), that source's entries read every 2 s, the level filter, and
 * the red dot. It reads while the window has focus: with the panel open while Live is on, and every
 * 10 s with it closed, the kept source (none until the person picks one), so an error that comes in lights the dot. An error new since
 * the last read lights it unless the panel shows Errors; showing Errors clears it.
 */
export function useLogWatch(project: string | undefined, open: boolean) {
  const call = useCall();
  const focused = useWindowFocused();
  const [kept, keep] = useKept(project && `mesa.logs.source.${project}`);
  const [sources, setSources] = useState<{ project: string; list: LogSource[] }>();
  const [stream, setStream] = useState<{ source: string; entries: KeyedEntry[] }>();
  /** The last stream read, so a read reuses its entries' objects (keyed). */
  const shown = useRef<{ source: string; entries: KeyedEntry[] }>(undefined);
  const [failure, setFailure] = useState<{ source: string; message: string }>();
  const [sourcesFailure, setSourcesFailure] = useState<string>();
  // The level filter is kept per project, as the source is, across sessions and restarts.
  const [keptLevel, keepLevel] = useKept(project && `mesa.logs.level.${project}`);
  const level: LevelFilter = LEVEL_FILTERS.find((l) => l === keptLevel) ?? 'all';
  const setLevel = (next: LevelFilter) => keepLevel(next === 'all' ? undefined : next);
  const [live, setLive] = useState(true);
  const [dot, setDot] = useState(false);
  /** The error keys the source read last had; another source's starts anew, lighting nothing. */
  const errors = useRef<{ source: string; keys: Set<string> }>(undefined);
  const watchingErrors = open && level === 'error';
  const watchingRef = useRef(watchingErrors);
  watchingRef.current = watchingErrors;
  const listed = sources?.project === project ? sources?.list : undefined;
  // The kept choice while it is listed (or before the list is read); none until the person picks one.
  const source = kept && (!listed || listed.some((each) => each.id === kept)) ? kept : undefined;

  const refreshSources = useCallback(async () => {
    if (!project) return;
    const found = await call('logs.sources', { project });
    setSourcesFailure(found.ok ? undefined : found.error.message);
    if (found.ok) setSources({ project, list: found.data.sources });
  }, [call, project]);
  // Open, it reads them each time; closed, once per project, so the dot has a source to watch.
  const unlisted = !listed;
  useEffect(() => {
    if (open || unlisted) void refreshSources();
  }, [open, unlisted, refreshSources]);
  useEffect(() => {
    if (watchingErrors) setDot(false);
  }, [watchingErrors]);

  const reading = Boolean(project && source && focused && (!open || live));
  /** The source a read is out for: one for another source never holds a new one back. */
  const busy = useRef<string>(undefined);
  useEffect(() => {
    if (!reading || !project || !source) return;
    let gone = false;
    const read = () => {
      if (busy.current === source) return;
      busy.current = source;
      void call('logs.read', { source, project, tail: TAIL })
        .then((result) => {
          if (gone) return;
          if (!result.ok) return setFailure({ source, message: result.error.message });
          const last = shown.current?.source === source ? shown.current.entries : undefined;
          const entries = keyed(result.data.entries, last);
          const now = new Set(entries.filter((e) => e.level === 'error').map((e) => e.key));
          const before = errors.current?.source === source ? errors.current.keys : undefined;
          if (before && [...now].some((key) => !before.has(key)) && !watchingRef.current)
            setDot(true);
          errors.current = { source, keys: now };
          setFailure(undefined);
          // An idle log reads the same each time: keep the list, so nothing renders again.
          if (last?.length === entries.length && entries.every((entry, at) => entry === last[at]))
            return;
          shown.current = { source, entries };
          setStream(shown.current);
        })
        .finally(() => {
          if (busy.current === source) busy.current = undefined;
        });
    };
    read();
    const timer = window.setInterval(read, open ? LOGS_POLL_MS : CLOSED_POLL_MS);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, [reading, open, call, project, source]);

  return {
    project,
    /** The project's sources, once read. */
    sources: listed,
    source,
    /** Picks a source and keeps the choice for the project. */
    pick: keep,
    entries: stream && stream.source === source ? stream.entries : undefined,
    failure: sourcesFailure ?? (failure && failure.source === source ? failure.message : undefined),
    level,
    setLevel,
    live,
    setLive,
    /** An error came in that the panel has not shown under Errors. */
    dot,
    refreshSources,
  };
}

/** What `useLogWatch` returns. */
export type LogWatch = ReturnType<typeof useLogWatch>;
