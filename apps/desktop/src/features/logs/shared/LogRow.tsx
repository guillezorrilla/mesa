import type { LogLevel } from '@mesa/core';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A log line's shell: a selectable row with time, badge, logger (shown once the panel is wide) and
 * body columns, an error's stripe and tint, and its hover actions on the right.
 */
export function LogRow(props: {
  level: LogLevel | null;
  /** Absent for a row that is only read (a request's merged view). */
  selected?: boolean;
  onSelect?: () => void;
  time: ReactNode;
  badge: ReactNode;
  /** The logger, or any node in its column (a source's dot and name). */
  logger?: ReactNode;
  /** Show the logger column at any width (Cloud Logs' service), so every row has the same columns. */
  loggerAlways?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={props.selected ?? false}
      tabIndex={0}
      data-level={props.level ?? undefined}
      className={cn(
        'group relative grid grid-cols-[4.25rem_3rem_minmax(0,1fr)] items-start gap-x-2 border-l-2 border-transparent py-px pr-3 pl-2.5 outline-none hover:bg-accent/60 focus-visible:bg-accent/60 @min-[40rem]:grid-cols-[4.25rem_3rem_9rem_minmax(0,1fr)]',
        props.onSelect && 'cursor-pointer',
        props.loggerAlways && 'grid-cols-[4.25rem_3rem_7.5rem_minmax(0,1fr)]',
        props.level === 'error' && 'border-l-state-failed/70 bg-state-failed/[0.04]',
        props.selected && 'border-l-state-working bg-state-working/10 hover:bg-state-working/12',
      )}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (!props.onSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        props.onSelect();
      }}
    >
      <span className="text-muted-foreground tabular-nums">{props.time}</span>
      {props.badge}
      <span
        data-testid="log-logger"
        className={cn(
          'hidden truncate text-muted-foreground/70 @min-[40rem]:block',
          props.loggerAlways && 'block',
        )}
        title={typeof props.logger === 'string' ? props.logger : undefined}
      >
        {props.logger}
      </span>
      {props.children}
      {props.actions && (
        <div className="absolute top-0 right-2 hidden items-center rounded-md border bg-card/95 shadow-sm group-hover:flex group-focus-within:flex has-[[data-state=open]]:flex">
          {props.actions}
        </div>
      )}
    </div>
  );
}
