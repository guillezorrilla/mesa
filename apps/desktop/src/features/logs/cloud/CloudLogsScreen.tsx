import type { CloudErrorGroup } from '@mesa/core';
import { ALL_ENVS, groupQuery, plainTitle } from '@mesa/core/browser';
import { BookmarkPlus } from 'lucide-react';
import { Activity, useEffect, useRef, useState } from 'react';
import { CenteredState } from '@/components/CenteredState';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { useCommand } from '@/lib/useCommand';
import type { CloudMode } from '@/lib/workspaceView';
import { CloudFilterBar } from './CloudFilterBar';
import { projectsLabel } from './cloudLines';
import { CloudErrorsPanel } from './errors/CloudErrorsPanel';
import { CloudExplorerPanel } from './explorer/CloudExplorerPanel';
import { restoredFilters } from './restoredFilters';
import { CloudSetupPanel } from './setup/CloudSetupPanel';
import type { CloudLogsView } from './types';
import { useCloudLogsConfig } from './useCloudLogsConfig';
import { SaveViewDialog } from './views/SaveViewDialog';

/**
 * The sidebar Logs tab's main area (CONTEXT.md, Cloud Logs): the setup until logs.gcp is set, then
 * the bar over two views: Errors (incidents, master and detail) and the Explorer with Claude beside
 * it. The filters live in the view, so a saved view, an error or an Ask opens them.
 */
export function CloudLogsScreen(props: {
  mode: CloudMode;
  filters: CloudFilters;
  ask?: string;
  prompt?: string;
  onView: (next: CloudLogsView) => void;
  onSession: (id: string) => void;
}) {
  const { loaded, gcp, refresh } = useCloudLogsConfig();
  const asks = useCommand('logs.asks');
  const [saving, setSaving] = useState(false);
  const { mode } = props;
  // Each view stays mounted once shown, hidden while the other is (Activity), so switching keeps it.
  const [seenModes, setSeenModes] = useState<ReadonlySet<CloudMode>>(() => new Set([mode]));
  if (!seenModes.has(mode)) setSeenModes(new Set([...seenModes, mode]));
  // Kept filters a setup change made stale (a removed env or project) fall back: the view is
  // rewritten once with what is left, and a note says what changed until the next choice.
  const restored = gcp
    ? restoredFilters(props.filters, gcp)
    : { filters: props.filters, notes: [] as string[] };
  const [notes, setNotes] = useState<string[]>([]);
  const rewrite = useRef(() => {});
  rewrite.current = () => props.onView({ mode, query: restored.filters, ask: props.ask });
  const stale = restored.notes.join('\n');
  useEffect(() => {
    if (!stale) return;
    setNotes(stale.split('\n'));
    rewrite.current();
  }, [stale]);
  if (!loaded) return <CenteredState message="Loading" />;
  if (!gcp)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CloudSetupPanel onSaved={() => void refresh()} />
      </div>
    );
  const env = restored.filters.env ?? Object.keys(gcp.envs)[0];
  // The env is resolved once, so both views and the bar agree on it.
  const filters = { ...restored.filters, env };
  const go = (next: Partial<CloudLogsView>) => {
    setNotes([]);
    props.onView({ mode, query: restored.filters, ask: props.ask, ...next });
  };
  const askAbout = (group: CloudErrorGroup) =>
    go({
      mode: 'explorer',
      query: {
        ...restored.filters,
        projects: [group.project],
        services: undefined,
        filter: groupQuery(group, gcp),
      },
      ask: undefined,
      prompt: `Explain this error and what likely causes it: ${plainTitle(group.message)}`,
    });
  return (
    <section aria-label="Cloud Logs" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <CloudFilterBar
        gcp={gcp}
        mode={mode}
        filters={restored.filters}
        env={env}
        onMode={(next) => go({ mode: next })}
        onFilters={(query) => go({ query })}
        actions={
          mode === 'explorer' && (
            <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
              <BookmarkPlus aria-hidden /> Save as view
            </Button>
          )
        }
      />
      {notes.length > 0 && (
        <Muted size="xs" role="status" className="-mt-2 text-state-waiting">
          {notes.join(' ')}
        </Muted>
      )}
      {mode === 'errors' && env !== undefined && env !== ALL_ENVS && (
        <Muted size="xs" className="-mt-2">
          Errors in {env}, grouped from its logs; New, Back again and all-env counts from Error
          Reporting.
        </Muted>
      )}
      {seenModes.has('errors') && (
        <Activity mode={mode === 'errors' ? 'visible' : 'hidden'}>
          <CloudErrorsPanel
            filters={filters}
            reading={`${projectsLabel(gcp.projects)}${env && env !== ALL_ENVS ? ` ${env}` : ''}`}
            onAsk={askAbout}
            onExplore={(query) => go({ mode: 'explorer', query, ask: undefined })}
            onSession={props.onSession}
          />
        </Activity>
      )}
      {seenModes.has('explorer') && (
        <Activity mode={mode === 'explorer' ? 'visible' : 'hidden'}>
          <CloudExplorerPanel
            key={props.ask ?? 'new'}
            filters={filters}
            conversation={asks.data?.asks.find((a) => a.id === props.ask)}
            draft={props.prompt}
            onFilters={(query) => go({ query })}
            onAsked={(asked) => {
              void asks.refreshEverywhere();
              go({ ask: asked.conversation, prompt: undefined });
            }}
            onNewConversation={() => go({ ask: undefined, prompt: undefined })}
            onSession={props.onSession}
          />
        </Activity>
      )}
      {saving && <SaveViewDialog filters={restored.filters} onDone={() => setSaving(false)} />}
    </section>
  );
}
