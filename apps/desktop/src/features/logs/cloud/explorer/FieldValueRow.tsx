import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ClauseState } from './explorerQuery';

/**
 * One value of a field in the fields pane, a fixed two-column row: its label, which truncates, and
 * its count, right-aligned and always shown; a thin bar under the row for its share of the entries
 * counted, and on hover + (only these) and - (all but these) over the label's end. A click toggles
 * it in the query; in the query it shows checked, excluded it shows struck, none in the range muted.
 */
export function FieldValueRow(props: {
  label: ReactNode;
  /** The whole value, for the tooltip. */
  title: string;
  count: number;
  share: number;
  state?: ClauseState;
  /** None in the range: shown muted, still a click to query it. */
  muted?: boolean;
  onToggle: () => void;
  onInclude: () => void;
  onExclude: () => void;
}) {
  return (
    <li
      data-state={props.state}
      className={cn(
        'group/value relative grid h-6 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1.5 text-xs',
        props.state === 'in' && 'bg-state-working/10 text-state-working',
        props.muted && !props.state && 'opacity-50',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1.5 h-0.5 rounded-full bg-muted-foreground/20"
        style={{ width: `calc((100% - 0.75rem) * ${Math.min(1, props.share)})` }}
      />
      <span className="relative flex min-w-0 items-center">
        <button
          type="button"
          title={props.title}
          aria-pressed={props.state === 'in'}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline',
            props.state === 'out' && 'text-muted-foreground line-through',
          )}
          onClick={props.onToggle}
        >
          {props.state === 'in' && <Check aria-hidden className="size-3 shrink-0" />}
          <span className="min-w-0 truncate">{props.label}</span>
        </button>
        <span className="absolute right-0 hidden items-center rounded bg-card shadow-sm group-focus-within/value:flex group-hover/value:flex">
          <button
            type="button"
            aria-label={`Only ${props.title}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={props.onInclude}
          >
            <Plus aria-hidden className="size-3" />
          </button>
          <button
            type="button"
            aria-label={`Not ${props.title}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={props.onExclude}
          >
            <Minus aria-hidden className="size-3" />
          </button>
        </span>
      </span>
      <span className="text-right text-[11px] text-muted-foreground tabular-nums">
        {props.count}
      </span>
    </li>
  );
}
