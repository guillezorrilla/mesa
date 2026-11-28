import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A group of identical errors' header: a toggle with its title, its badges and trailing text, then
 * its actions (shown on hover, and while one of their menus is open).
 */
export function ErrorGroupHeader(props: {
  title: string;
  open: boolean;
  onOpen: () => void;
  badges?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="group/header flex items-center hover:bg-accent">
      <button
        type="button"
        aria-expanded={props.open}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left"
        onClick={props.onOpen}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            props.open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={props.title}>
          {props.title}
        </span>
        {props.badges}
        {props.trailing}
      </button>
      {props.actions && (
        <div className="hidden pr-2 group-hover/header:flex has-[[data-state=open]]:flex">
          {props.actions}
        </div>
      )}
    </div>
  );
}
