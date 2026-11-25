import { ALL_ENVS } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { ReadingBar } from '@/components/ReadingBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { CloudFilters } from '@/lib/client/logs';
import { useCommand, useOptional } from '@/lib/useCommand';
import type { CloudMode } from '@/lib/workspaceView';
import { CloudAskPanel } from './CloudAskPanel';
import { CloudErrorsPanel } from './CloudErrorsPanel';
import { CloudExplorePanel } from './CloudExplorePanel';
import { CloudProjectSwitcher } from './CloudProjectSwitcher';
import { CloudReadAlert } from './CloudReadAlert';
import { CloudServiceField } from './CloudServiceField';
import { CloudSetupPanel } from './CloudSetupPanel';
import { CLOUD_RANGES, type CloudRange } from './cloudLines';
import { SaveViewDialog } from './SaveViewDialog';
import { useSaveView } from './useSaveView';

const SEVERITIES = [
  ['', 'Any severity'],
  ['warning', 'Warning and worse'],
  ['error', 'Error and worse'],
] as const;

/** Explore's read, made only while Explore shows. */
function ExploreMode(props: {
  filters: CloudFilters;
  focus?: string;
  counts?: { start: string; count: number }[];
  onFilters: (filters: CloudFilters) => void;
}) {
  const read = useOptional('logs.gcp', props.filters);
  return (
    <div className="grid gap-3">
      {read.busy && <ReadingBar />}
      <CloudReadAlert error={read.error} warnings={read.data?.warnings} />
      <CloudExplorePanel
        read={read.data}
        busy={read.busy}
        filters={props.filters}
        counts={props.counts}
        focus={props.focus}
        onFilters={props.onFilters}
      />
    </div>
  );
}

/** Explore for a view that maps to a log-based metric: its counts from Cloud Monitoring. */
function MeteredExplore(
  props: Parameters<typeof ExploreMode>[0] & { projects: string[]; metric: string },
) {
  const { projects, metric, ...rest } = props;
  const counts = useOptional('logs.counts', { projects, metric, since: props.filters.since });
  return <ExploreMode {...rest} counts={counts.data?.counts} />;
}

/**
 * The sidebar Logs tab's main area (CONTEXT.md, Cloud Logs): the setup until logs.gcp is set,
 * then the filter bar over three modes: Errors, the error groups (first); Explore, the entries;
 * Ask, a kept conversation. The filters live in the view, so a saved view or an Ask opens them.
 */
export function CloudLogsScreen(props: {
  mode: CloudMode;
  filters: CloudFilters;
  ask?: string;
  onView: (next: { mode: CloudMode; query: CloudFilters; ask?: string }) => void;
  onSession: (id: string) => void;
}) {
  const config = useCommand('config.get');
  const gcp = config.data?.logs.gcp;
  const asks = useCommand('logs.asks');
  const saveView = useSaveView();
  const [revision, setRevision] = useState(0);
  const [text, setText] = useState(props.filters.text ?? '');
  const [focus, setFocus] = useState<string>();
  const [saving, setSaving] = useState<CloudFilters>();
  const { filters, mode } = props;
  const set = (next: CloudFilters, nextMode: CloudMode = mode) =>
    props.onView({ mode: nextMode, query: next, ask: props.ask });
  if (!config.data) return <Muted>Loading</Muted>;
  if (!gcp) return <CloudSetupPanel onSaved={() => void config.refreshEverywhere()} />;
  const envs = Object.keys(gcp.envs);
  const env = filters.env ?? envs[0];
  // Error Reporting keeps no env, so an env's groups come from its logs (cloudErrors).
  const envGroups = mode === 'errors' && env !== undefined && env !== ALL_ENVS;
  const conversation = asks.data?.asks.find((a) => a.id === props.ask);
  return (
    <section aria-label="Cloud Logs" className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-2 [&_[data-slot=native-select-wrapper]]:w-auto">
        <CloudProjectSwitcher
          gcp={gcp}
          onSwitched={() => set({ ...filters, services: undefined, projects: undefined })}
        />
        <SegmentedControl<CloudMode>
          label="Mode"
          value={mode}
          onChange={(next) => set(filters, next)}
          options={[
            ['errors', 'Errors'],
            ['explore', 'Explore'],
            ['ask', 'Ask'],
          ]}
        />
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {envs.length > 0 && (
          <NativeSelect
            aria-label="Env"
            size="sm"
            className="text-xs"
            value={env}
            onChange={(event) =>
              set({ ...filters, env: event.currentTarget.value, services: undefined })
            }
          >
            <NativeSelectOption value={ALL_ENVS}>All envs</NativeSelectOption>
            {envs.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <CloudServiceField
          env={filters.env}
          picked={filters.services ?? []}
          onChange={(picked) => set({ ...filters, services: picked.length ? picked : undefined })}
        />
        {mode === 'explore' && (
          <NativeSelect
            aria-label="Severity"
            size="sm"
            className="text-xs"
            value={filters.severity ?? ''}
            onChange={(event) =>
              set({
                ...filters,
                severity: (event.currentTarget.value || undefined) as CloudFilters['severity'],
              })
            }
          >
            {SEVERITIES.map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          aria-label="Time range"
          size="sm"
          className="text-xs"
          value={filters.since ?? '1h'}
          onChange={(event) => set({ ...filters, since: event.currentTarget.value })}
        >
          {Object.entries(CLOUD_RANGES).map(([value, [label]]) => (
            <NativeSelectOption key={value} value={value as CloudRange}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {mode === 'explore' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              set({ ...filters, text: text.trim() || undefined });
            }}
          >
            <Input
              aria-label="Text"
              placeholder="Text, then Enter"
              className="h-8 w-48 text-xs"
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
            />
          </form>
        )}
        <Label
          className="gap-1.5 text-xs font-normal text-muted-foreground"
          title="Leaves out load balancer, proxy, GKE system and audit logs"
        >
          <Switch
            checked={!filters.all}
            onCheckedChange={(on) => set({ ...filters, all: on ? undefined : true })}
          />
          Your services only
        </Label>
        {env === 'prod' && mode === 'ask' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-state-waiting" />
            prod: Ask sends masked entries to the model
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {mode === 'explore' && (
            <Button size="sm" variant="ghost" onClick={() => setSaving(filters)}>
              Save as view
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setRevision((n) => n + 1)}>
            <RefreshCw aria-hidden /> Refresh
          </Button>
        </div>
      </div>
      {envGroups && (
        <Muted size="xs" className="-mt-2">
          Errors in {env}, grouped from its logs; New, Back again and all-env counts from Error
          Reporting.
        </Muted>
      )}
      <div key={revision} className="grid gap-4">
        {mode === 'errors' ? (
          <CloudErrorsPanel
            filters={{ ...filters, env }}
            onSession={props.onSession}
            onExplore={(query) => set(query, 'explore')}
          />
        ) : mode === 'explore' ? (
          filters.metric && filters.projects?.length ? (
            <MeteredExplore
              projects={filters.projects}
              metric={filters.metric}
              filters={{ ...filters, env }}
              focus={focus}
              onFilters={(next) => set(next)}
            />
          ) : (
            <ExploreMode
              filters={{ ...filters, env }}
              focus={focus}
              onFilters={(next) => set(next)}
            />
          )
        ) : (
          <CloudAskPanel
            filters={{ ...filters, env }}
            conversation={conversation}
            onAsked={(asked) => {
              void asks.refresh();
              props.onView({ mode: 'ask', query: filters, ask: asked.conversation });
            }}
            onCite={(id) => {
              setFocus(id);
              set(filters, 'explore');
            }}
            onSaveView={(query) =>
              setSaving({
                filter: query.filter,
                ...(query.project ? { projects: [query.project] } : {}),
              })
            }
            onSession={props.onSession}
          />
        )}
      </div>
      {saving && (
        <SaveViewDialog
          filters={saving}
          onCancel={() => setSaving(undefined)}
          onSave={(name) => {
            setSaving(undefined);
            void saveView(name, saving);
          }}
        />
      )}
    </section>
  );
}
