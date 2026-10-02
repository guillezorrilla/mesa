import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A section's small uppercase heading, as over a list or a panel. */
export function SectionLabel({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}
