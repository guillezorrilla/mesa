import { FilterChip } from '@/components/FilterChip';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LevelFilter } from '../shared/logLines';

/** A level filter's label: a dot in its colour, its name, and how many entries it holds. */
function levelLabel(name: string, count: number, dot?: string) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />}
      {name}
      <span className="text-muted-foreground">{count}</span>
    </span>
  );
}

/** The Logs panel's filters: All / Errors / Warn with counts, and the text filter with its request chip. */
export function LogFilters(props: {
  level: LevelFilter;
  counts: Record<LevelFilter, number>;
  text: string;
  request?: string;
  onLevel: (level: LevelFilter) => void;
  onText: (text: string) => void;
  onClearRequest: () => void;
}) {
  return (
    <>
      <SegmentedControl<LevelFilter>
        label="Level"
        value={props.level}
        onChange={props.onLevel}
        className="h-7 [&>button]:px-2"
        options={[
          ['all', levelLabel('All', props.counts.all)],
          ['error', levelLabel('Errors', props.counts.error, 'bg-state-failed')],
          ['warn', levelLabel('Warn', props.counts.warn, 'bg-state-waiting')],
        ]}
      />
      <div className="flex h-7 min-w-24 flex-1 items-center gap-1 rounded-md border border-input px-1 focus-within:ring-[3px] focus-within:ring-ring/50">
        {props.request && (
          <FilterChip removeLabel="Show every request" onRemove={props.onClearRequest}>
            request {props.request}
          </FilterChip>
        )}
        <Input
          aria-label="Filter lines"
          placeholder="Filter, e.g. /orders"
          className="h-6 min-w-16 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
          value={props.text}
          onChange={(event) => props.onText(event.currentTarget.value)}
        />
      </div>
    </>
  );
}
