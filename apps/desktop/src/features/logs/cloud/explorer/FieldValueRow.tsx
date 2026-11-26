import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ClauseState } from './explorerQuery';

/**
 * One value of a field in the fields pane: a thin bar behind it for its share of the entries read,
 * its count on the right, and on hover + (only these) and - (all but these). A click toggles it in
 * the query; in the query it shows checked, excluded it shows struck.
 */
export function FieldValueRow(props: {
  label: ReactNode;
  /** The whole value, for the tooltip. */
  title: string;
  count: number;
  share: number;
  state?: ClauseState;
  onToggle: () => void;
  onInclude: () => void;
  onExclude: () => void;
}) {
  return (
    <li
      data-state={props.state}
      className={cn(
        'group/value relative flex h-6 items-center gap-1.5 rounded px-1.5 text-xs',
        props.state === 'in' && 'bg-state-working/10 text-state-working',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-0 rounded-sm bg-muted-foreground/12"
        style={{ width: `${Math.max(2, props.share * 100)}%` }}
      />
      <button
        type="button"
        title={props.title}
        aria-pressed={props.state === 'in'}
        className={cn(
          'relative flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline',
          props.state === 'out' && 'text-muted-foreground line-through',
        )}
        onClick={props.onToggle}
      >
        {props.state === 'in' && <Check aria-hidden className="size-3 shrink-0" />}
        <span className="min-w-0 truncate">{props.label}</span>
      </button>
      <span className="relative hidden shrink-0 items-center group-focus-within/value:flex group-hover/value:flex">
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
      <span className="relative shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {props.count}
      </span>
    </li>
  );
}
