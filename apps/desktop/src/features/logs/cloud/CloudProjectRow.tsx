import type { ProjectRow } from '@mesa/core/browser';
import { NO_ORGANIZATION } from '@mesa/core/browser';
import { Building2, ChevronRight, Folder, Star } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const indent = (depth: number) => ({ paddingLeft: 12 + depth * 18 });
const TYPE = 'w-24 shrink-0 text-[11px] text-muted-foreground';

/**
 * One row of the project list (CloudProjectPicker): a group's header, which opens and closes, or a
 * project with its checkbox, name, type, id and star. With `onOpen`, the name alone switches to
 * just that project; else it ticks the checkbox.
 */
export function CloudProjectRow(props: {
  row: ProjectRow;
  picked: boolean;
  current: boolean;
  starred?: boolean;
  onToggle: () => void;
  onFlip: () => void;
  onOpen?: () => void;
  onStar?: (on: boolean) => void;
}) {
  const { row } = props;
  if (row.kind === 'group')
    return (
      <button
        type="button"
        aria-expanded={row.open}
        className="flex h-full w-full items-center gap-2 pr-3 text-left text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        style={indent(row.depth)}
        onClick={props.onFlip}
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3.5 shrink-0 transition-transform', row.open && 'rotate-90')}
        />
        {row.key.startsWith('folders/') ? (
          <Folder aria-hidden className="size-3.5 shrink-0" />
        ) : row.key !== NO_ORGANIZATION ? (
          <Building2 aria-hidden className="size-3.5 shrink-0" />
        ) : null}
        <span className="truncate text-foreground">{row.name}</span>
        <span className="rounded bg-muted px-1.5 text-[10.5px] tabular-nums">
          {row.count.toLocaleString()}
        </span>
        <span className={cn(TYPE, 'ml-auto font-normal')}>
          {row.key.startsWith('folders/')
            ? 'Folder'
            : row.key !== NO_ORGANIZATION
              ? 'Organization'
              : ''}
        </span>
        <span className="w-6 shrink-0" />
      </button>
    );
  const name = <span className="min-w-0 truncate">{row.name}</span>;
  return (
    <div
      className="group flex h-full items-center gap-3 pr-2 text-sm hover:bg-accent/60"
      style={indent(row.depth)}
    >
      <Checkbox
        aria-label={`Pick ${row.id}`}
        checked={props.picked}
        onCheckedChange={props.onToggle}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {props.onOpen ? (
          <button
            type="button"
            title={`Switch to ${row.id} only`}
            className="min-w-0 truncate text-left hover:underline"
            onClick={props.onOpen}
          >
            {row.name}
          </button>
        ) : (
          <button type="button" className="min-w-0 truncate text-left" onClick={props.onToggle}>
            {name}
          </button>
        )}
        {props.current && (
          <span className="shrink-0 rounded border px-1.5 text-[10.5px] text-muted-foreground">
            gcloud default
          </span>
        )}
      </div>
      <span className={TYPE}>Project</span>
      <span className="w-44 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
        {row.id}
      </span>
      {props.onStar ? (
        <button
          type="button"
          aria-label={`${props.starred ? 'Unstar' : 'Star'} ${row.id}`}
          aria-pressed={props.starred}
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded hover:bg-background',
            props.starred ? 'text-state-waiting' : 'text-muted-foreground/50 hover:text-foreground',
          )}
          onClick={() => props.onStar?.(!props.starred)}
        >
          <Star aria-hidden className={cn('size-3.5', props.starred && 'fill-current')} />
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
    </div>
  );
}
