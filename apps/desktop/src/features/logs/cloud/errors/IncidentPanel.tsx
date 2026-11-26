import type { CloudDeploy, Incident } from '@mesa/core';
import { incidentReasons, plainTitle } from '@mesa/core/browser';
import { Link2 } from 'lucide-react';
import { dayTime } from '../../shared/logLines';
import { CloudErrorGroupRow } from './CloudErrorGroupRow';
import type { KeyedGroup } from './errorOrder';

/**
 * An incident in the Errors list (CONTEXT.md, Cloud Logs), distinct but quiet: how many errors since
 * when, why they are linked in words, the likely origin, then its groups' rows, the origin first.
 */
export function IncidentPanel(props: {
  incident: Incident;
  members: KeyedGroup[];
  selected: string | undefined;
  deploys: readonly CloudDeploy[];
  onSelect: (key: string) => void;
}) {
  const { incident, members } = props;
  const origin = members.find((m) => m.key === incident.origin)?.group;
  return (
    <li
      aria-label="Incident"
      className="border-y border-l-2 border-l-state-failed/50 bg-muted/25 first:border-t-0"
    >
      <div className="grid gap-0.5 px-4 pt-2.5 pb-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Link2 aria-hidden className="size-3.5 text-state-failed" />
          {members.length} related errors
          <span className="font-normal text-muted-foreground">
            since {dayTime(incident.started)}
          </span>
        </span>
        <span>{incidentReasons(incident.links)}.</span>
        {origin && (
          <span className="truncate">
            Likely origin:{' '}
            <span className="font-mono text-foreground">{plainTitle(origin.message)}</span>
          </span>
        )}
      </div>
      <ul className="divide-y bg-card">
        {members.map(({ key, group }) => (
          <li key={key}>
            <CloudErrorGroupRow
              group={group}
              nested
              deploys={props.deploys}
              selected={props.selected === key}
              onSelect={() => props.onSelect(key)}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}
