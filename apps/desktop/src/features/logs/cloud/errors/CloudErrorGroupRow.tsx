import type { CloudErrorGroup } from '@mesa/core';
import { plainTitle } from '@mesa/core/browser';
import { CountPill } from '@/components/CountPill';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';
import { dayTime } from '../../shared/logLines';
import { ServiceDot } from '../../shared/ServiceDot';
import { ErrorBadge } from './ErrorBadge';

/**
 * An error group in the Errors list, compact: its title without ids and numbers, its service, a
 * count sparkline over the range, New or Back again, its count and when last seen.
 */
export function CloudErrorGroupRow(props: {
  group: CloudErrorGroup;
  selected: boolean;
  indent?: boolean;
  onSelect: () => void;
}) {
  const { group } = props;
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      data-group={`${group.project} ${group.id}`}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-l-2 border-transparent px-3 py-2 text-left hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring',
        props.indent && 'pl-6',
        props.selected && 'border-l-state-working bg-state-working/10 hover:bg-state-working/12',
      )}
      onClick={props.onSelect}
    >
      <span className="truncate font-mono text-[12px] font-medium" title={group.message}>
        {plainTitle(group.message)}
      </span>
      <span className="flex items-center gap-2">
        {group.badge && <ErrorBadge badge={group.badge} />}
        <CountPill
          count={group.count}
          className="rounded bg-state-failed/12 px-1.5 text-[11px] font-medium text-state-failed tabular-nums"
        />
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        {group.services.map((service) => (
          <ServiceDot key={service} service={service} colorKey={`${group.project}/${service}`} />
        ))}
        <span className="shrink-0">last {dayTime(group.lastSeen)}</span>
      </span>
      {group.spark ? (
        <Sparkline counts={group.spark} label={`${group.count} over the range`} />
      ) : (
        <span />
      )}
    </button>
  );
}
