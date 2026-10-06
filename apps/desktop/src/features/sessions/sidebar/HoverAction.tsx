import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A session card's small icon button, shown while the card is hovered or focused. */
export function HoverAction({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'pointer-events-none absolute top-2 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
        className,
      )}
      {...props}
    />
  );
}
