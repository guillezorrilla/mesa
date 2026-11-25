import { cn } from '@/lib/utils';

const LABEL = { new: 'New', back: 'Back again' } as const;

/** An error group's New or Back again, from Error Reporting. */
export function ErrorBadge(props: { badge: 'new' | 'back' }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 font-sans text-[10.5px] font-medium',
        props.badge === 'new'
          ? 'bg-state-working/15 text-foreground'
          : 'bg-state-waiting/15 text-state-waiting',
      )}
    >
      {LABEL[props.badge]}
    </span>
  );
}
