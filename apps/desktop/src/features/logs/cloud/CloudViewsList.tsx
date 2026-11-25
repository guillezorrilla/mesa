import type { CloudView } from '@mesa/core';
import { Bookmark, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Input } from '@/components/ui/input';
import type { CloudFilters } from '@/lib/client/logs';
import { cn } from '@/lib/utils';

const ROW =
  'group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';
/** Past this many views, a filter box shows above them. */
const FILTER_PAST = 10;

/**
 * The Logs tab's saved views (CONTEXT.md, Cloud Logs): the person's own first, then those made from
 * log-based metrics in a From metrics group, closed until opened or a filter matches; a filter box
 * once there are more than 10.
 */
export function CloudViewsList(props: {
  views: CloudView[];
  onOpen: (query: CloudFilters) => void;
  onRemove: (name: string) => void;
}) {
  const [text, setText] = useState('');
  const [metricsOpen, setMetricsOpen] = useState(false);
  const term = text.trim().toLowerCase();
  const shown = props.views.filter((v) => !term || v.name.toLowerCase().includes(term));
  const own = shown.filter((v) => !v.metric);
  const fromMetrics = shown.filter((v) => v.metric);
  const open = metricsOpen || Boolean(term);
  if (!props.views.length)
    return (
      <Muted size="xs" className="px-2">
        No views yet: build a query in Explorer, then Save as view.
      </Muted>
    );
  const row = (view: CloudView) => {
    const { name, ...query } = view;
    return (
      <li key={name}>
        <div className={cn(ROW, 'pr-1')}>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2"
            onClick={() => props.onOpen(query)}
          >
            <Bookmark aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </button>
          <IconButton
            label={`Remove view ${name}`}
            icon={X}
            className="invisible group-hover:visible"
            onClick={() => props.onRemove(name)}
          />
        </div>
      </li>
    );
  };
  return (
    <div className="grid gap-1">
      {props.views.length > FILTER_PAST && (
        <Input
          aria-label="Filter views"
          placeholder="Filter views"
          className="mx-2 h-7 w-auto text-xs"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      )}
      {own.length > 0 && <ul aria-label="Saved views">{own.map(row)}</ul>}
      {fromMetrics.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setMetricsOpen(!metricsOpen)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
            />
            From metrics
            <span className="rounded bg-muted px-1.5 text-[10.5px] tabular-nums">
              {fromMetrics.length}
            </span>
          </button>
          {open && (
            <ul aria-label="Views from metrics" className="pl-3">
              {fromMetrics.map(row)}
            </ul>
          )}
        </div>
      )}
      {term && !shown.length && (
        <Muted size="xs" className="px-2">
          No view matches {text.trim()}.
        </Muted>
      )}
    </div>
  );
}
