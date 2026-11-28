import type { LogLevel } from '@mesa/core';
import { LEVEL_NAMES } from '@mesa/core/browser';
import { cn } from '@/lib/utils';

/** Each level's colours. */
const TONES: Record<LogLevel, string> = {
  error: 'bg-state-failed/12 text-state-failed',
  warn: 'bg-state-waiting/15 text-state-waiting',
  info: 'bg-muted text-muted-foreground',
  debug: 'text-muted-foreground/70',
};

/**
 * A log entry's level as a small fixed-width badge; empty for an entry with none, unless `label`
 * names it (a Cloud Logging severity such as NOTICE or DEFAULT), outlined.
 */
export function LevelBadge(props: { level: LogLevel | null; label?: string }) {
  return (
    <span
      data-level
      className={cn(
        'mt-0.5 inline-flex h-4 w-12 items-center justify-center rounded font-sans text-[10px] font-semibold tracking-wide',
        props.level ? TONES[props.level] : props.label && 'border text-muted-foreground',
      )}
    >
      {props.label ?? (props.level ? LEVEL_NAMES[props.level] : '')}
    </span>
  );
}
