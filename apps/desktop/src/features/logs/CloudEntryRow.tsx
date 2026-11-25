import type { CloudLogEntry } from '@mesa/core';
import { cloudLevel, splitMessage } from '@mesa/core/browser';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { serviceColor, serviceRef, traceId } from './cloudLines';
import { LEVEL_BADGE, MessageText } from './LogEntryRow';
import { LogStack } from './LogStack';
import { clockTime } from './logLines';

/**
 * One Cloud Logs entry, looking like a Logs panel row (LogEntryRow): its time, its severity as a
 * level badge, its service (with its colour when several show), its message with request ids to
 * filter by and tinted statuses, its stack folded under it (LogStack) and its context fields, each
 * a click away from a filter; its trace id filters to that trace across every project. An error
 * has the red left stripe; an entry Ask cited is marked, and the one a citation opened outlined.
 */
export const CloudEntryRow = memo(function CloudEntryRow(props: {
  entry: CloudLogEntry;
  cited: boolean;
  focused: boolean;
  /** Several services show: the service column names each, with its colour. */
  services: boolean;
  onTrace: (trace: string) => void;
  /** Adds a context field's value as a filter. */
  onField: (key: string, value: string) => void;
  /** Filters to a request id the message names. */
  onRequest: (id: string) => void;
}) {
  const { entry } = props;
  const level = cloudLevel(entry.severity);
  const ref = serviceRef(entry);
  const { head, stack } = splitMessage(entry.message);
  return (
    <li
      data-id={entry.id}
      data-cited={props.cited || undefined}
      data-level={level ?? undefined}
      className={cn(
        'grid items-start gap-x-2 border-l-2 border-transparent py-px pr-3 pl-2.5 hover:bg-accent/60',
        props.services
          ? 'grid-cols-[4.25rem_3rem_9rem_minmax(0,1fr)_4.5rem]'
          : 'grid-cols-[4.25rem_3rem_minmax(0,1fr)_4.5rem]',
        level === 'error' && 'border-l-state-failed/70 bg-state-failed/[0.04]',
        props.cited && 'border-l-state-working bg-state-working/10',
        props.focused && 'outline-2 -outline-offset-2 outline-ring',
      )}
    >
      <span className="text-muted-foreground tabular-nums">{clockTime(entry.time)}</span>
      <span
        title={entry.severity}
        className={cn(
          'mt-0.5 inline-flex h-4 w-12 items-center justify-center rounded font-sans text-[10px] font-semibold tracking-wide',
          level ? LEVEL_BADGE[level] : 'text-muted-foreground/70',
        )}
      >
        {entry.severity.slice(0, 5)}
      </span>
      {props.services && (
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground/70" title={ref}>
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: serviceColor(ref) }}
          />
          <span className="truncate">{entry.service ?? '-'}</span>
        </span>
      )}
      <div className="min-w-0">
        <MessageText message={head} onRequest={props.onRequest} />
        {stack && <LogStack stack={stack} />}
        {Object.keys(entry.fields).length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-1 font-sans text-[10.5px]">
            {Object.entries(entry.fields)
              .slice(0, 4)
              .map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  title={`Filter to ${key} = ${value}`}
                  className="max-w-56 truncate rounded bg-muted px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => props.onField(key, value)}
                >
                  {key}: {value}
                </button>
              ))}
          </span>
        )}
      </div>
      {entry.trace ? (
        <button
          type="button"
          title={`Show trace ${traceId(entry.trace)} in every project`}
          className="truncate text-left text-state-working underline decoration-dotted underline-offset-2 hover:bg-state-working/10"
          onClick={() => props.onTrace(traceId(entry.trace as string))}
        >
          {traceId(entry.trace).slice(0, 8)}
        </button>
      ) : (
        <span />
      )}
    </li>
  );
});
