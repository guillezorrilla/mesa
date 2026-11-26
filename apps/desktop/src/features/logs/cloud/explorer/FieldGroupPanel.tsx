import { ChevronRight, Columns2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ClauseState } from './explorerQuery';
import { FieldValueRow } from './FieldValueRow';

/** How many values a field shows before Show all. */
const TOP = 5;

/** One value as a field group lists it. */
export type FieldValue = {
  value: string;
  count: number;
  clause: string;
  label: ReactNode;
  state?: ClauseState;
};

/**
 * A field in the fields pane: its name and how many distinct values it has, collapsible; its top
 * five values (FieldValueRow), then Show all; open or closed as the pane keeps it; with `onPin`, Show as column puts it beside each row.
 */
export function FieldGroupPanel(props: {
  name: string;
  values: readonly FieldValue[];
  /** The entries read, for each value's share. */
  total: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  pinned?: boolean;
  onPin?: () => void;
  /** Puts `clause` in the query (`in`), excluded (`out`), or takes it out (undefined). */
  onSet: (clause: string, state?: ClauseState) => void;
}) {
  const { open } = props;
  const [all, setAll] = useState(false);
  const shown = all ? props.values : props.values.slice(0, TOP);
  // A click on a value in the query takes it out; + and - set it, or take it out when already so.
  const set = (value: FieldValue, state: ClauseState) =>
    props.onSet(value.clause, value.state === state ? undefined : state);
  return (
    <section aria-label={props.name} className="grid">
      <div className="group/field flex h-7 items-center gap-1 px-1">
        <button
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium"
          onClick={() => props.onOpen(!open)}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="truncate">{props.name}</span>
          <span className="ml-1 shrink-0 text-[10.5px] font-normal text-muted-foreground tabular-nums">
            {props.values.length}
          </span>
        </button>
        {props.onPin && (
          <button
            type="button"
            aria-pressed={props.pinned}
            title={props.pinned ? 'Hide this column' : 'Show as column'}
            aria-label={`${props.pinned ? 'Hide' : 'Show'} ${props.name} as column`}
            className={cn(
              'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground',
              props.pinned ? 'text-state-working' : 'hidden group-hover/field:block',
            )}
            onClick={props.onPin}
          >
            <Columns2 aria-hidden className="size-3" />
          </button>
        )}
      </div>
      {open && (
        <ul className="grid gap-px pl-3">
          {shown.map((value) => (
            <FieldValueRow
              key={value.clause}
              label={value.label}
              title={value.value}
              count={value.count}
              share={value.count / Math.max(1, props.total)}
              state={value.state}
              onToggle={() => props.onSet(value.clause, value.state ? undefined : 'in')}
              onInclude={() => set(value, 'in')}
              onExclude={() => set(value, 'out')}
            />
          ))}
          {props.values.length > TOP && (
            <li>
              <button
                type="button"
                className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setAll(!all)}
              >
                {all ? 'Show fewer' : `Show all (${props.values.length})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
