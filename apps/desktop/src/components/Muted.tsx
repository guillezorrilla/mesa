import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Secondary text: a hint, an empty or loading state, a detail under a title. */
export function Muted({
  size = 'sm',
  className,
  ...props
}: { size?: 'sm' | 'xs' } & ComponentProps<'p'>) {
  return (
    <p
      className={cn(size === 'sm' ? 'text-sm' : 'text-xs', 'text-muted-foreground', className)}
      {...props}
    />
  );
}
