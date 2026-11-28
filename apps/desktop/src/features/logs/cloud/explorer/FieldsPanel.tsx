import type { CloudLogEntry, CloudVolume } from '@mesa/core';
import {
  cloudLevel,
  fieldStats,
  serviceClause,
  servicePaths,
  severityLabel,
  severityRank,
} from '@mesa/core/browser';
import { PanelLeftClose, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Input } from '@/components/ui/input';
import { useElementWidth } from '@/lib/useElementWidth';
import { LevelBadge } from '../../shared/LevelBadge';
import { ServiceDot } from '../../shared/ServiceDot';
import { CLOUD_RANGES, type CloudRange } from '../cloudLines';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { type ClauseState, clauseState, fieldClause } from './explorerQuery';
import { FieldGroupPanel, type FieldValue } from './FieldGroupPanel';
import { shortValue } from './fieldText';
import { useServiceKinds } from './useServiceKinds';

/** A value row's room besides its text (bar padding, + and -, count), and one character's width, in pixels. */
const ROW_CHROME_PX = 92;
const CHAR_PX = 6.6;

/** The More fields group's name among the kept sections. */
const MORE = 'More fields';

const counted = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

type Group = {
  name: string;
  values: FieldValue[];
  pin?: boolean;
  note?: string;
  total?: number;
  /** Every value at once, no Show all. */
  all?: boolean;
};

/** Severities always listed, even at none, so each is a click that queries the whole range. */
const ALWAYS = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEFAULT'];

/**
 * The Explorer's fields (CONTEXT.md, Cloud Logs): Service (its colour and kind) and Severity (its
 * badge, every severity listed, ERROR and worse first, none muted) counted over the whole range by
 * Cloud Monitoring when the query allows it (`volume`), else over the entries read, saying so; then the app's own context fields, then More fields (plumbing such
 * as a logger or a revision), collapsed; a field whose values are nearly all different (an id, a
 * timestamp) shows only when searched for. Search filters fields and values. A value's click,
 * + or - sets its clause in the query, which the pane reads back as checked or struck.
 */
export function FieldsPanel(props: {
  entries: readonly CloudLogEntry[];
  /** The range's counts from Cloud Monitoring (logs.volume), when read. */
  volume?: CloudVolume;
  /** The time range, for what the range counts say they cover. */
  since?: string;
  query: string;
  env?: string;
  /** The pane's width in pixels, for how much of a long value fits. */
  width: number;
  columns: readonly string[];
  onSet: (clause: string, state?: ClauseState) => void;
  onPin: (key: string) => void;
  /** Whether a field's section is open, as kept, else `initial`; and its setter. */
  isOpen: (name: string, initial: boolean) => boolean;
  onOpen: (name: string, open: boolean) => void;
  onHide: () => void;
}) {
  const { entries, query } = props;
  const [search, setSearch] = useState('');
  // The width the pane is drawn at, which a narrow window holds below the kept one.
  const nav = useRef<HTMLElement>(null);
  const drawn = useElementWidth(nav, props.width);
  const config = useCloudLogsConfig().gcp;
  const kindOf = useServiceKinds(props.env, props.volume);
  const fit = Math.max(10, Math.floor((Math.min(drawn, props.width) - ROW_CHROME_PX) / CHAR_PX));
  const stats = useMemo(() => fieldStats(entries), [entries]);
  const groups = useMemo(() => {
    const range = props.volume?.counted ? props.volume : undefined;
    const shown = `in the ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} shown`;
    const label = CLOUD_RANGES[(props.since ?? '1h') as CloudRange]?.[0].toLowerCase();
    const rangeNote = range ? (label ?? 'over the range') : shown;
    const severityCounts = new Map(
      range
        ? range.severities.map((s) => [s.severity, s.count] as const)
        : counted(entries.map((e) => e.severity)),
    );
    const listed = [
      ...new Set([...ALWAYS, ...[...severityCounts].filter(([, n]) => n > 0).map(([s]) => s)]),
    ].sort((a, b) => severityRank(a) - severityRank(b));
    const paths = servicePaths({ service: config?.service });
    const value = (
      v: string,
      count: number,
      clause: string,
      label: FieldValue['label'],
      title?: string,
    ) => ({ value: v, count, clause, label, title, state: clauseState(query, clause) });
    const services: Group = {
      name: 'Service',
      note: range?.services ? rangeNote : shown,
      total: range?.services ? range.services.reduce((n, s) => n + s.count, 0) : entries.length,
      values: (range?.services
        ? range.services.map((s) => [`${s.project}/${s.name}`, s.count] as const)
        : counted(entries.flatMap((e) => (e.service ? [`${e.project}/${e.service}`] : [])))
      ).map(([ref, count]) => {
        const name = ref.split('/').slice(1).join('/');
        const kind = kindOf.get(ref);
        // The kind shows beside the name while there is room, else in the tooltip.
        const roomy = Boolean(kind) && name.length + (kind?.length ?? 0) + 2 <= fit;
        return value(
          name,
          count,
          serviceClause(name, paths),
          <span className="flex min-w-0 items-center gap-1.5">
            <ServiceDot service={shortValue(name, fit)} colorKey={ref} />
            {roomy && <span className="shrink-0 text-[10px] text-muted-foreground">{kind}</span>}
          </span>,
          kind ? `${name}, ${kind}` : name,
        );
      }),
    };
    const severities: Group = {
      name: 'Severity',
      note: rangeNote,
      all: true,
      total: [...severityCounts.values()].reduce((n, c) => n + c, 0),
      values: listed.map((severity) =>
        value(
          severity,
          severityCounts.get(severity) ?? 0,
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
        note: shown,
        values: stat.values.map((v) =>
          value(v.value, v.count, fieldClause(stat.key, v.value), shortValue(v.value, fit)),
        ),
      } as Group,
    }));
    return { services, severities, fields };
  }, [entries, stats, query, fit, kindOf, config?.service, props.volume, props.since]);
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
        key={group.name}
        name={group.name}
        values={group.values}
        all={group.all}
        note={group.note}
        total={group.total ?? entries.length}
        open={Boolean(needle) || props.isOpen(group.name, open)}
        onOpen={(next) => props.onOpen(group.name, next)}
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
    <nav ref={nav} aria-label="Fields" className="flex h-full min-h-0 flex-col">
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
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-1 overflow-y-auto p-1 pb-3 [scrollbar-gutter:stable]">
          {props.volume && !props.volume.counted && (
            <Muted size="xs" className="px-2 pt-1">
              Service and severity counts are of the entries shown: {props.volume.why}.
            </Muted>
          )}
          {section(matched(groups.services))}
          {section(matched(groups.severities))}
          {main.map((group) => section(group))}
          {more.length > 0 && (
            <details
              open={Boolean(needle) || props.isOpen(MORE, false)}
              onToggle={(event) => {
                if (!needle) props.onOpen(MORE, event.currentTarget.open);
              }}
              className="group/more"
            >
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
