import type { MessagePart } from '@mesa/core';
import { messageParts, muteKey } from '@mesa/core/browser';
import { Copy, EyeOff, type LucideIcon, SendHorizontal } from 'lucide-react';
import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LogStack } from './LogStack';
import { clockTime, type KeyedEntry, levelName } from './logLines';

/** Each level's badge. */
const BADGE = {
  error: 'bg-state-failed/12 text-state-failed',
  warn: 'bg-state-waiting/15 text-state-waiting',
  info: 'bg-muted text-muted-foreground',
  debug: 'text-muted-foreground/70',
};

/** What a row does: select it, filter by a request, and its hover actions Copy, Send and Mute. */
export type RowActions = {
  onToggle: (key: string) => void;
  onRequest: (id: string) => void;
  onMute: (pattern: string) => void;
  onCopy: (entry: KeyedEntry) => void;
  onSendOne: (key: string) => void;
  /** What Send does for this session: "Send to agent", or "Start a session with this line". */
  sendLabel: string;
};

function Part(props: { part: MessagePart; onRequest: (id: string) => void }) {
  const { part } = props;
  const { request } = part;
  if (request)
    return (
      <button
        type="button"
        title={`Show every line of request ${request}`}
        className="whitespace-nowrap rounded-sm text-state-working underline decoration-dotted underline-offset-2 hover:bg-state-working/10"
        onClick={(event) => {
          event.stopPropagation();
          props.onRequest(request);
        }}
      >
        {part.text}
      </button>
    );
  if (part.status)
    return (
      <span
        className={cn(
          'font-semibold',
          part.status === 'failed' ? 'text-state-failed' : 'text-state-waiting',
        )}
      >
        {part.text}
      </span>
    );
  if (part.slow)
    return (
      <span className="whitespace-nowrap rounded-sm bg-state-waiting/15 px-0.5 text-state-waiting">
        {part.text}
      </span>
    );
  return part.text;
}

/** One hover action: an icon button that never selects the row. */
function Action(props: { label: string; icon: LucideIcon; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      <Icon aria-hidden className="size-3.5" />
    </button>
  );
}

/**
 * One log entry: its time, its level as a badge, its logger (when the panel is wide), its message
 * with request ids to filter by, tinted statuses and slow durations, and its stack folded under it.
 * An error has a red left stripe and a faint tint. A click selects it; on hover, Copy, Send and Mute.
 */
export const LogEntryRow = memo(function LogEntryRow(
  props: { entry: KeyedEntry; selected: boolean } & RowActions,
) {
  const { entry } = props;
  const parts = useMemo(() => messageParts(entry.message), [entry.message]);
  return (
    <div
      role="option"
      aria-selected={props.selected}
      tabIndex={0}
      data-level={entry.level ?? undefined}
      className={cn(
        'group relative grid cursor-pointer grid-cols-[4.25rem_3rem_minmax(0,1fr)] items-start gap-x-2 border-l-2 border-transparent py-px pr-3 pl-2.5 outline-none hover:bg-accent/60 focus-visible:bg-accent/60 @min-[40rem]:grid-cols-[4.25rem_3rem_9rem_minmax(0,1fr)]',
        entry.level === 'error' && 'border-l-state-failed/70 bg-state-failed/[0.04]',
        props.selected && 'border-l-state-working bg-state-working/10 hover:bg-state-working/12',
      )}
      onClick={() => props.onToggle(entry.key)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        props.onToggle(entry.key);
      }}
    >
      <span className="text-muted-foreground tabular-nums">{clockTime(entry.time)}</span>
      <span
        data-level
        className={cn(
          'mt-0.5 inline-flex h-4 w-12 items-center justify-center rounded font-sans text-[10px] font-semibold tracking-wide',
          entry.level && BADGE[entry.level],
        )}
      >
        {levelName(entry)}
      </span>
      <span
        data-testid="log-logger"
        className="hidden truncate text-muted-foreground/70 @min-[40rem]:block"
        title={entry.logger ?? undefined}
      >
        {entry.logger}
      </span>
      <div className="min-w-0">
        <span className="whitespace-pre-wrap break-words">
          {parts.map((part, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts are fixed.
            <Part key={at} part={part} onRequest={props.onRequest} />
          ))}
        </span>
        {entry.stack && <LogStack stack={entry.stack} />}
      </div>
      <div className="absolute top-0 right-2 hidden items-center rounded-md border bg-card/95 shadow-sm group-hover:flex group-focus-within:flex">
        <Action label="Copy line" icon={Copy} onClick={() => props.onCopy(entry)} />
        <Action
          label={props.sendLabel}
          icon={SendHorizontal}
          onClick={() => props.onSendOne(entry.key)}
        />
        <Action
          label={`Mute lines like this: ${muteKey(entry.message)}`}
          icon={EyeOff}
          onClick={() => props.onMute(muteKey(entry.message))}
        />
      </div>
    </div>
  );
});
