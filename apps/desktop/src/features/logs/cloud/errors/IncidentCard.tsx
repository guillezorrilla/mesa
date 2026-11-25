import type { Incident } from '@mesa/core';
import { plainTitle } from '@mesa/core/browser';
import { Link2 } from 'lucide-react';
import { dayTime } from '../../shared/logLines';
import { ServiceDot } from '../../shared/ServiceDot';
import { CloudErrorGroupRow } from './CloudErrorGroupRow';
import type { KeyedGroup } from './errorOrder';

/**
 * An incident in the Errors list (CONTEXT.md, Cloud Logs): its services, when it started and its
 * likely origin, over its groups' compact rows, the origin first.
 */
export function IncidentCard(props: {
  incident: Incident;
  members: KeyedGroup[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const { incident } = props;
  const { members } = props;
  const origin = members.find((m) => m.key === incident.origin)?.group;
  return (
    <li aria-label="Incident" className="border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-state-failed/[0.05] px-3 pt-2 pb-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 font-semibold tracking-wide text-state-failed uppercase">
          <Link2 aria-hidden className="size-3.5" /> Incident
        </span>
        <span className="text-muted-foreground">
          {members.length} errors, since {dayTime(incident.started)}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
          {incident.services.map((service) => (
            <ServiceDot key={service} service={service} />
          ))}
        </span>
        {origin && (
          <span className="basis-full truncate text-muted-foreground">
            Likely origin:{' '}
            <span className="font-mono text-foreground">{plainTitle(origin.message)}</span>
          </span>
        )}
      </div>
      <ul>
        {members.map(({ key, group }) => (
          <li key={key}>
            <CloudErrorGroupRow
              group={group}
              indent
              selected={props.selected === key}
              onSelect={() => props.onSelect(key)}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}
