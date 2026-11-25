import type { MessagePart } from '@mesa/core';
import { messageParts, muteKey } from '@mesa/core/browser';
import { EyeOff } from 'lucide-react';
import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LogStack } from './LogStack';
import { clockTime, type KeyedEntry, levelName } from './logLines';

/** Each level's ink, and an error's tint. */
const TONE = {
  error: 'bg-state-failed/8 [&_[data-level]]:text-state-failed',
  warn: '[&_[data-level]]:text-state-waiting',
  info: '[&_[data-level]]:text-muted-foreground',
  debug: '[&_[data-level]]:text-muted-foreground/70',
};

/** What a row does with its parts: filter by a request, mute lines like it, select it. */
export type RowActions = {
  onToggle: (key: string) => void;
  onRequest: (id: string) => void;
  onMute: (pattern: string) => void;
};

function Part(props: { part: MessagePart; onRequest: (id: string) => void }) {
  const { part } = props;
  const { request } = part;
  if (request)
    return (
      <button
        type="button"
        title={`Show every line of request ${request}`}
        className="rounded-sm text-state-working underline decoration-dotted underline-offset-2 hover:bg-state-working/10"
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
      <span className="rounded-sm bg-state-waiting/15 px-0.5 text-state-waiting">{part.text}</span>
    );
  return part.text;
}

/**
 * One log entry: its time, its level coloured, its logger (when the panel is wide), its message
 * with request ids to filter by, tinted statuses and slow durations marked, and its stack folded
 * under it. A click selects it; Mute hides lines like it.
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
        'group grid cursor-pointer grid-cols-[4.25rem_2.75rem_minmax(0,1fr)] gap-x-2 border-l-2 border-transparent px-3 py-px outline-none hover:bg-accent focus-visible:bg-accent @min-[36rem]:grid-cols-[4.25rem_2.75rem_9rem_minmax(0,1fr)]',
        entry.level && TONE[entry.level],
        props.selected && 'border-l-state-working bg-state-working/12 hover:bg-state-working/15',
      )}
      onClick={() => props.onToggle(entry.key)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        props.onToggle(entry.key);
      }}
    >
      <span className="text-muted-foreground tabular-nums">{clockTime(entry.time)}</span>
      <span data-level className="font-medium">
        {levelName(entry)}
      </span>
      <span
        data-testid="log-logger"
        className="hidden truncate text-muted-foreground/70 @min-[36rem]:block"
        title={entry.logger ?? undefined}
      >
        {entry.logger}
      </span>
      <div className="min-w-0">
        <div className="flex items-start gap-1">
          <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {parts.map((part, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts are fixed.
              <Part key={at} part={part} onRequest={props.onRequest} />
            ))}
          </span>
          <button
            type="button"
            aria-label="Mute lines like this"
            title={`Mute lines like this: ${muteKey(entry.message)}`}
            className="mt-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              props.onMute(muteKey(entry.message));
            }}
          >
            <EyeOff aria-hidden className="size-3" />
          </button>
        </div>
        {entry.stack && <LogStack stack={entry.stack} />}
      </div>
    </div>
  );
});
