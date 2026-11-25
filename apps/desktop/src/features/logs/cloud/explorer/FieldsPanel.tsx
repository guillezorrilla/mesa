import type { CloudLogEntry } from '@mesa/core';
import { facetsOf, serviceClause, servicePaths } from '@mesa/core/browser';
import { useMemo } from 'react';
import { Muted } from '@/components/Muted';
import { ServiceDot } from '../../shared/ServiceDot';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { fieldClause } from './explorerQuery';

type Row = { label: string; count: number; clause: string; service?: string };

function Group(props: {
  title: string;
  rows: Row[];
  onAdd: (clause: string, exclude: boolean) => void;
}) {
  if (!props.rows.length) return null;
  return (
    <section aria-label={props.title} className="grid gap-0.5">
      <h3 className="px-2 pt-2 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        {props.title}
      </h3>
      {props.rows.map((row) => (
        <button
          key={row.clause}
          type="button"
          title={`Click adds ${row.clause}; Alt-click excludes it`}
          className="flex min-w-0 items-center gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-accent"
          onClick={(event) => props.onAdd(row.clause, event.altKey)}
        >
          <span className="min-w-0 flex-1 truncate">
            {row.service ? <ServiceDot service={row.label} colorKey={row.service} /> : row.label}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {row.count}
          </span>
        </button>
      ))}
    </section>
  );
}

const counted = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

/**
 * The Explorer's fields (CONTEXT.md, Cloud Logs): services, severities and the context fields the
 * entries read carry, each value with its count; a click adds it to the query, Alt-click excludes it.
 */
export function FieldsPanel(props: {
  entries: readonly CloudLogEntry[];
  onAdd: (clause: string, exclude: boolean) => void;
}) {
  const { entries } = props;
  const service = useCloudLogsConfig().gcp?.service;
  const groups = useMemo(() => {
    const paths = servicePaths({ service });
    const services = counted(
      entries.flatMap((e) => (e.service ? [`${e.project}/${e.service}`] : [])),
    ).map(([ref, count]) => {
      const name = ref.split('/').slice(1).join('/');
      return {
        label: name,
        count,
        service: ref,
        clause: serviceClause(name, paths),
      };
    });
    const severities = counted(entries.map((e) => e.severity)).map(([severity, count]) => ({
      label: severity,
      count,
      clause: `severity=${severity}`,
    }));
    const fields = facetsOf(entries, 12, 6).map((facet) => ({
      title: facet.key,
      rows: facet.values.map(({ value, count }) => ({
        label: value,
        count,
        clause: fieldClause(facet.key, value),
      })),
    }));
    return { services, severities, fields };
  }, [entries, service]);
  if (!entries.length)
    return (
      <Muted size="xs" className="p-3">
        Fields show once entries are read.
      </Muted>
    );
  return (
    <nav aria-label="Fields" className="grid content-start gap-1 overflow-y-auto pb-3">
      <Group title="Service" rows={groups.services} onAdd={props.onAdd} />
      <Group title="Severity" rows={groups.severities} onAdd={props.onAdd} />
      {groups.fields.map((field) => (
        <Group key={field.title} title={field.title} rows={field.rows} onAdd={props.onAdd} />
      ))}
    </nav>
  );
}
