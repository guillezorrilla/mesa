import { ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { clockTime } from '../shared/logLines';

/**
 * A run of identical entries (occurrenceRuns): its newest shown, then "x10 between 15:18:35 and
 * 15:18:45", which opens the rest.
 */
export function RepeatRun<E extends { time: string }>(props: {
  entries: E[];
  newest: string;
  oldest: string;
  row: (entry: E) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = props.entries;
  if (!first) return null;
  return (
    <li>
      {props.row(first)}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            className={cn(
              'flex items-center gap-1 py-0.5 font-sans text-[11px] text-muted-foreground hover:text-foreground',
              props.className,
            )}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-3 transition-transform', open && 'rotate-90')}
            />
            x{props.entries.length} between {clockTime(props.oldest)} and {clockTime(props.newest)}
          </button>
          {open && <div className="border-l-2 border-muted">{rest.map(props.row)}</div>}
        </>
      )}
    </li>
  );
}
