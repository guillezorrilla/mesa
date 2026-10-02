import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

/**
 * A ghost button that shows only an icon; `label` names it for readers and as its tooltip.
 * `active` makes it a toggle and marks it pressed.
 */
export function IconButton({
  label,
  icon: Icon,
  active,
  className,
  size = 'icon-sm',
  ...props
}: { label: string; icon: LucideIcon; active?: boolean } & Omit<
  ComponentProps<typeof Button>,
  'children' | 'variant'
>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'text-muted-foreground hover:text-foreground',
        active && 'text-state-working',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden />
    </Button>
  );
}
