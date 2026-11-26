import type { CloudErrorGroup } from '@mesa/core';
import { groupKey, plainTitle } from '@mesa/core/browser';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';
import { dayTime } from '../../shared/logLines';
import { ServiceDot } from '../../shared/ServiceDot';
import { ErrorBadge } from './ErrorBadge';
import { ERROR_ROW } from './errorRow';

/**
 * An error group in the Errors list, one fixed height: its title without ids and numbers over its
 * service, badge and last seen; its count and a sparkline of the range in one right-hand column.
 */
export function CloudErrorGroupRow(props: {
  group: CloudErrorGroup;
  selected: boolean;
  nested?: boolean;
  onSelect: () => void;
}) {
  const { group } = props;
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      data-group={groupKey(group)}
      className={cn(
        ERROR_ROW,
        'w-full border-l-2 border-transparent text-left hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        props.nested && 'pl-6',
        props.selected &&
          'border-l-state-working bg-state-working/[0.08] hover:bg-state-working/10',
      )}
      onClick={props.onSelect}
    >
      <span className="grid min-w-0 gap-1">
        <span
          className="truncate font-mono text-[12px] font-medium text-foreground"
          title={group.message}
        >
          {plainTitle(group.message)}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {group.services.length ? (
            <ServiceDot
              service={group.services[0] as string}
              colorKey={`${group.project}/${group.services[0]}`}
            />
          ) : (
            <span>no service</span>
          )}
          {group.services.length > 1 && <span>+{group.services.length - 1}</span>}
          {group.badge && <ErrorBadge badge={group.badge} />}
          <span className="ml-auto shrink-0 tabular-nums">{dayTime(group.lastSeen)}</span>
        </span>
      </span>
      <span className="grid justify-items-end gap-1">
        <span className="font-mono text-[12px] font-semibold text-state-failed tabular-nums">
          {group.count.toLocaleString()}
        </span>
        {group.spark ? (
          <Sparkline
            counts={group.spark}
            className="h-3.5"
            label={`${group.count} over the range`}
          />
        ) : (
          <span className="h-3.5" />
        )}
      </span>
    </button>
  );
}
