import { cn } from '@/lib/utils';

/** When a chat row was written, as the hour and minute shown on hovering or focusing its row. */
export function MessageTime(props: { at: string | null; side: 'left' | 'right' }) {
  if (!props.at) return null;
  return (
    <time
      dateTime={props.at}
      className={cn(
        '-top-5 absolute text-muted-foreground text-xs opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100',
        props.side === 'right' ? 'right-1' : 'left-0',
      )}
    >
      {new Date(props.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}
