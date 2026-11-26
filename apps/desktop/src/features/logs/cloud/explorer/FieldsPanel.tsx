import type { CloudLogEntry } from '@mesa/core';
import {
  cloudLevel,
  fieldStats,
  serviceClause,
  servicePaths,
  severityLabel,
  severityRank,
} from '@mesa/core/browser';
import { PanelLeftClose, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Input } from '@/components/ui/input';
import { useOptional } from '@/lib/useCommand';
import { LevelBadge } from '../../shared/LevelBadge';
import { ServiceDot } from '../../shared/ServiceDot';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { type ClauseState, clauseState, fieldClause } from './explorerQuery';
import { FieldGroupPanel, type FieldValue } from './FieldGroupPanel';
import { shortValue } from './fieldText';

/** A value row's room besides its text (bar padding, + and -, count), and one character's width, in pixels. */
const ROW_CHROME_PX = 92;
const CHAR_PX = 6.6;

const counted = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

type Group = { name: string; values: FieldValue[]; pin?: boolean };

/**
 * The Explorer's fields (CONTEXT.md, Cloud Logs), over the entries read: Service (its colour and
 * kind), Severity (its badge), then the app's own context fields, then More fields (plumbing such
 * as a logger or a revision), collapsed; a field whose values are nearly all different (an id, a
 * timestamp) shows only when searched for. Search filters fields and values. A value's click,
 * + or - sets its clause in the query, which the pane reads back as checked or struck.
 */
export function FieldsPanel(props: {
  entries: readonly CloudLogEntry[];
  query: string;
  env?: string;
  /** The pane's width in pixels, for how much of a long value fits. */
  width: number;
  columns: readonly string[];
  onSet: (clause: string, state?: ClauseState) => void;
  onPin: (key: string) => void;
  onHide: () => void;
}) {
  const { entries, query } = props;
  const [search, setSearch] = useState('');
  const config = useCloudLogsConfig().gcp;
  const kinds = useOptional('logs.gcpServices', { env: props.env });
  const fit = Math.max(10, Math.floor((props.width - ROW_CHROME_PX) / CHAR_PX));
  const stats = useMemo(() => fieldStats(entries), [entries]);
  const groups = useMemo(() => {
    const kindOf = new Map(
      (kinds.data?.services ?? []).map((s) => [`${s.project}/${s.name}`, s.kind]),
    );
    const paths = servicePaths({ service: config?.service });
    const value = (v: string, count: number, clause: string, label: FieldValue['label']) => ({
      value: v,
      count,
      clause,
      label,
      state: clauseState(query, clause),
    });
    const services: Group = {
      name: 'Service',
      values: counted(entries.flatMap((e) => (e.service ? [`${e.project}/${e.service}`] : []))).map(
        ([ref, count]) => {
          const name = ref.split('/').slice(1).join('/');
          return value(
            name,
            count,
            serviceClause(name, paths),
            <span className="flex min-w-0 items-center gap-1.5">
              <ServiceDot service={shortValue(name, fit - 6, 'service')} colorKey={ref} />
              {kindOf.get(ref) && (
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {kindOf.get(ref)}
                </span>
              )}
            </span>,
          );
        },
      ),
    };
    const severities: Group = {
      name: 'Severity',
      values: counted(entries.map((e) => e.severity))
        .sort((a, b) => severityRank(a[0]) - severityRank(b[0]))
        .map(([severity, count]) =>
          value(
            severity,
            count,
            `severity=${severity}`,
            <LevelBadge level={cloudLevel(severity)} label={severityLabel(severity)} />,
          ),
        ),
    };
    const fields = stats.map((stat) => ({
      tier: stat.tier,
      group: {
        name: stat.key,
        pin: true,
        values: stat.values.map((v) =>
          value(v.value, v.count, fieldClause(stat.key, v.value), shortValue(v.value, fit)),
        ),
      } as Group,
    }));
    return { services, severities, fields };
  }, [entries, stats, query, fit, kinds.data, config?.service]);
  const needle = search.trim().toLowerCase();
  // Searching keeps a field whose name matches whole, else only its values that match.
  const matched = (group: Group): Group | undefined => {
    if (!needle || group.name.toLowerCase().includes(needle)) return group;
    const values = group.values.filter((v) => v.value.toLowerCase().includes(needle));
    return values.length ? { ...group, values } : undefined;
  };
  const section = (group: Group | undefined, open = true) =>
    group?.values.length ? (
      <FieldGroupPanel
        key={`${group.name} ${needle}`}
        name={group.name}
        values={group.values}
        total={entries.length}
        open={open || Boolean(needle)}
        pinned={props.columns.includes(group.name)}
        onPin={group.pin ? () => props.onPin(group.name) : undefined}
        onSet={props.onSet}
      />
    ) : null;
  const main = groups.fields.filter((f) => f.tier === 'main').map((f) => matched(f.group));
  const more = groups.fields
    .filter((f) => f.tier === 'more' || (needle && f.tier === 'unique'))
    .map((f) => matched(f.group))
    .filter((g): g is Group => Boolean(g));
  const hidden = groups.fields.filter((f) => f.tier === 'unique').length;
  return (
    <nav aria-label="Fields" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b p-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search fields"
            placeholder="Search fields and values"
            className="h-7 pl-6 text-xs"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        <IconButton label="Hide fields" icon={PanelLeftClose} onClick={props.onHide} />
      </div>
      {!entries.length ? (
        <Muted size="xs" className="p-3">
          Fields show once entries are read.
        </Muted>
      ) : (
        <div className="grid min-h-0 content-start gap-1 overflow-y-auto p-1 pb-3">
          {section(matched(groups.services))}
          {section(matched(groups.severities))}
          {main.map((group) => section(group))}
          {more.length > 0 && (
            <details open={Boolean(needle)} className="group/more">
              <summary className="flex h-7 cursor-pointer items-center gap-1 px-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                More fields
                <span className="tabular-nums">{more.length}</span>
              </summary>
              {more.map((group) => section(group, false))}
            </details>
          )}
          {!needle && hidden > 0 && (
            <Muted size="xs" className="px-2 pt-1">
              {hidden} {hidden === 1 ? 'field' : 'fields'} with a different value on nearly every
              entry (ids, timestamps) show when searched for.
            </Muted>
          )}
        </div>
      )}
    </nav>
  );
}
