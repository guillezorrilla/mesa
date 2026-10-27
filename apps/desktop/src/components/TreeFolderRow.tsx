import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A tree's folder row: a button that opens or closes it, with its chevron, an optional icon, its
 * name and an optional trailing note (a count), indented `indent` px.
 */
export function TreeFolderRow({
  name,
  expanded,
  indent,
  icon,
  trailing,
  className,
  style,
  ...props
}: {
  name: ReactNode;
  expanded: boolean;
  indent: number;
  /** Its icon, open and closed. */
  icon?: { open: LucideIcon; closed: LucideIcon };
  trailing?: ReactNode;
} & Omit<ComponentProps<'button'>, 'children' | 'type' | 'name'>) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const Icon = icon && (expanded ? icon.open : icon.closed);
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className={cn('flex w-full items-center gap-1.5 text-left hover:bg-accent/50', className)}
      style={{ ...style, paddingLeft: indent }}
      {...props}
    >
      <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{name}</span>
      {trailing !== undefined && (
        <span className="ml-auto text-xs text-muted-foreground">{trailing}</span>
      )}
    </button>
  );
}
