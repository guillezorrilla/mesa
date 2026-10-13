import type { Ticket } from '@mesa/core';
import { cn } from '@/lib/utils';

/**
 * A ticket's status category as a small icon, the way issue trackers draw it: a dashed ring to
 * do, a half-filled ring in progress, a filled check done; in the status's own color where the
 * tracker gives one (ClickUp), so statuses of one category tell apart.
 */
export function StatusIcon(props: {
  category: string;
  color?: string | undefined;
  className?: string;
}) {
  const className = cn('size-3.5 shrink-0', props.className);
  const style = props.color ? { color: props.color } : undefined;
  if (props.category === 'done')
    return (
      <svg
        viewBox="0 0 14 14"
        className={cn(className, 'text-state-done')}
        style={style}
        aria-hidden
      >
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path d="m4.5 7 1.8 1.8 3.4-3.6" fill="none" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  if (props.category === 'indeterminate')
    return (
      <svg
        viewBox="0 0 14 14"
        className={cn(className, 'text-state-waiting')}
        style={style}
        aria-hidden
      >
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 14 14"
      className={cn(className, 'text-muted-foreground')}
      style={style}
      aria-hidden
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

/**
 * Each status category's name, in the order the list ranks its groups; a name heads a group only
 * for tickets with no status of their own.
 */
export const CATEGORIES: Record<Ticket['category'], string> = {
  indeterminate: 'In progress',
  new: 'To do',
  done: 'Done',
};
