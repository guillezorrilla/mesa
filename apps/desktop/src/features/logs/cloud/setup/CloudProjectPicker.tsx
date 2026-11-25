import type { CloudProject, CloudProjectGroup } from '@mesa/core';
import { NO_ORGANIZATION, type ProjectRow, projectRows } from '@mesa/core/browser';
import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { FilterChip } from '@/components/FilterChip';
import { RetryAlert } from '@/components/RetryAlert';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ProjectTab } from '../types';
import { CloudProjectRow } from './CloudProjectRow';

/** A row's height and how many show: the list draws only the rows in view, as there can be thousands. */
const ROW_HEIGHT = 36;
const SHOWN = 9;
const SPARE = 6;
const ALL_ORGS = '';

/**
 * Every GCP project the account sees (CONTEXT.md, Cloud Logs), used by the setup and the project
 * switcher: the picked ones as removable chips; an organization, a filter typed (projects, folders,
 * organizations) and Recent, Starred or All; All pins gcloud's default and the picked ones on top
 * (as the filter last changed, so a row does not jump away as it is checked), then groups by
 * organization and folder (projectRows). A failed listing shows its message and Retry.
 */
export function CloudProjectPicker(props: {
  projects: CloudProject[] | undefined;
  groups: Record<string, CloudProjectGroup> | undefined;
  current: string | null | undefined;
  picked: string[];
  onPicked: (picked: string[]) => void;
  error?: { message: string; fix?: string };
  onRetry: () => void;
  /** Recent and Starred, when the picker offers them. */
  recent?: string[];
  starred?: string[];
  onStar?: (project: string, on: boolean) => void;
  /** The name alone switches to just that project. */
  onOpen?: (project: string) => void;
  tab?: ProjectTab;
}) {
  const [text, setText] = useState('');
  const [org, setOrg] = useState(ALL_ORGS);
  const [tab, setTab] = useState<ProjectTab>(props.tab ?? 'all');
  const [pinned, setPinned] = useState(props.picked);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [top, setTop] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const { current, picked, projects, groups } = props;
  const names = useMemo(() => new Map(projects?.map((p) => [p.id, p.name])), [projects]);
  const orgs = Object.entries(groups ?? {}).filter(([key]) => key.startsWith('organizations/'));
  const rows = useMemo((): ProjectRow[] => {
    if (tab === 'all')
      return projectRows(projects ?? [], groups ?? {}, {
        term: text,
        pinned: [...new Set([...(current ? [current] : []), ...pinned])],
        toggled,
        org: org || undefined,
      });
    const term = text.trim().toLowerCase();
    return ((tab === 'recent' ? props.recent : props.starred) ?? [])
      .map((id) => ({ id, name: names.get(id) ?? id }))
      .filter((p) => !term || `${p.id} ${p.name}`.toLowerCase().includes(term))
      .map((p) => ({ kind: 'project' as const, key: `${tab}:${p.id}`, ...p, depth: 0 }));
  }, [
    tab,
    projects,
    groups,
    current,
    pinned,
    text,
    toggled,
    org,
    names,
    props.recent,
    props.starred,
  ]);
  // Every project the groups hold, a closed folder's too.
  const matched =
    tab === 'all'
      ? rows.reduce(
          (sum, row) => sum + (row.kind === 'group' && row.depth === 0 ? row.count : 0),
          0,
        )
      : rows.length;
  const toggle = (id: string) =>
    props.onPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  const flip = (key: string) =>
    setToggled((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const restart = () => {
    setPinned(picked);
    setTop(0);
    if (list.current) list.current.scrollTop = 0;
  };
  const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - SPARE);
  const drawn = rows.slice(first, first + SHOWN + 2 * SPARE);
  const offersTabs = Boolean(props.recent || props.starred);
  return (
    <div className="grid gap-2.5">
      {picked.length > 0 && (
        <ul aria-label="Picked projects" className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <li key={id}>
              <FilterChip removeLabel={`Remove ${id}`} onRemove={() => toggle(id)}>
                {names.get(id) ?? id}
              </FilterChip>
            </li>
          ))}
        </ul>
      )}
      {(offersTabs || orgs.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 [&_[data-slot=native-select-wrapper]]:w-auto">
          {orgs.length > 0 && (
            <NativeSelect
              aria-label="Organization"
              size="sm"
              className="text-xs"
              value={org}
              onChange={(event) => {
                setOrg(event.currentTarget.value);
                setTab('all');
                restart();
              }}
            >
              <NativeSelectOption value={ALL_ORGS}>All organizations</NativeSelectOption>
              <NativeSelectOption value={NO_ORGANIZATION}>No organization</NativeSelectOption>
              {orgs.map(([key, group]) => (
                <NativeSelectOption key={key} value={key}>
                  {group.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          {offersTabs && (
            <SegmentedControl<ProjectTab>
              label="Projects shown"
              value={tab}
              onChange={(next) => {
                setTab(next);
                restart();
              }}
              options={[
                ['recent', 'Recent'],
                ['starred', 'Starred'],
                ['all', 'All'],
              ]}
            />
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Filter projects"
            placeholder="Filter by project, folder or organization"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
              restart();
            }}
          />
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {projects?.length
              ? `${matched.toLocaleString()} of ${projects.length.toLocaleString()}`
              : ''}
          </span>
        </div>
        <div
          ref={list}
          className="relative overflow-y-auto"
          style={{ height: ROW_HEIGHT * SHOWN }}
          onScroll={(event) => setTop(event.currentTarget.scrollTop)}
        >
          {props.error ? (
            <RetryAlert
              className="m-3 w-auto"
              title="gcloud could not list your projects"
              message={props.error.message}
              fix={props.error.fix}
              onRetry={props.onRetry}
            />
          ) : !projects ? (
            <div role="status" aria-label="Loading projects" className="grid gap-px p-1">
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Asking gcloud for every project you can see
              </p>
              {Array.from({ length: SHOWN - 3 }, (_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
                  key={i}
                  className="flex h-8 items-center gap-3 px-2"
                  style={{ opacity: 1 - i * 0.15 }}
                >
                  <span className="size-4 rounded-sm bg-muted" />
                  <span className="h-2.5 w-40 animate-pulse rounded bg-muted" />
                  <span className="h-2.5 w-24 animate-pulse rounded bg-muted/70" />
                </div>
              ))}
            </div>
          ) : rows.length ? (
            <ul aria-label="GCP projects" style={{ height: rows.length * ROW_HEIGHT }}>
              {drawn.map((row, i) => (
                <li
                  key={row.key}
                  className="absolute inset-x-0"
                  style={{ top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <CloudProjectRow
                    row={row}
                    picked={row.kind === 'project' && picked.includes(row.id)}
                    current={
                      row.kind === 'project' && row.id === current && row.key.startsWith('pinned:')
                    }
                    starred={row.kind === 'project' && props.starred?.includes(row.id)}
                    onToggle={() => row.kind === 'project' && toggle(row.id)}
                    onFlip={() => flip(row.key)}
                    onOpen={
                      props.onOpen && row.kind === 'project'
                        ? () => props.onOpen?.(row.id)
                        : undefined
                    }
                    onStar={
                      props.onStar && row.kind === 'project'
                        ? (on) => props.onStar?.(row.id, on)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {text.trim()
                ? `No project matches ${text.trim()}.`
                : tab === 'recent'
                  ? 'No recent projects yet.'
                  : tab === 'starred'
                    ? 'No starred projects: star one under All.'
                    : 'This account sees no projects.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
