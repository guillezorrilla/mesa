import { memo } from 'react';
import { cn } from '@/lib/utils';
import { clockTime, type KeyedEntry, levelName } from './logLines';

/** Each level's ink, and an error's tint. */
const TONE = {
  error: 'bg-state-failed/8 [&_[data-level]]:text-state-failed',
  warn: '[&_[data-level]]:text-state-waiting',
  info: '[&_[data-level]]:text-muted-foreground',
  debug: '[&_[data-level]]:text-muted-foreground/70',
};

/** One log entry: its time, its level coloured, its message, and its stack under it; a click selects it. */
export const LogEntryRow = memo(function LogEntryRow(props: {
  entry: KeyedEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  const { entry } = props;
  return (
    <div
      role="option"
      aria-selected={props.selected}
      tabIndex={0}
      data-level={entry.level ?? undefined}
      className={cn(
        'grid cursor-pointer grid-cols-[4.25rem_2.75rem_minmax(0,1fr)] gap-2 border-l-2 border-transparent px-3 py-px outline-none hover:bg-accent focus-visible:bg-accent',
        entry.level && TONE[entry.level],
        props.selected && 'border-l-state-working bg-state-working/12 hover:bg-state-working/15',
      )}
      onClick={props.onToggle}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        props.onToggle();
      }}
    >
      <span className="text-muted-foreground tabular-nums">{clockTime(entry.time)}</span>
      <span data-level className="font-medium">
        {levelName(entry)}
      </span>
      <span className="whitespace-pre-wrap break-words">
        {entry.message}
        {entry.stack && <span className="block text-muted-foreground">{entry.stack}</span>}
      </span>
    </div>
  );
});
