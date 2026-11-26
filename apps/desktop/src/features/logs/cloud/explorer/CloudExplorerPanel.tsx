import type { CloudAsk, CloudLogEntry } from '@mesa/core';
import { entryGroup, queryFields, withOwn } from '@mesa/core/browser';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ReadingBar } from '@/components/ReadingBar';
import { ResizeHandle } from '@/components/ResizeHandle';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useCall, useOptional } from '@/lib/useCommand';
import { clampWidth, type WidthBounds } from '@/lib/useKeptWidth';
import { CloudReadAlert } from '../CloudReadAlert';
import { CloudSessionDialogs } from '../CloudSessionDialogs';
import type { EntryActions } from '../types';
import { useCloudCopy } from '../useCloudCopy';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { useCloudSession } from '../useCloudSession';
import { useLogsKept } from '../useLogsKept';
import { useOlderEntries } from '../useOlderEntries';
import { SaveViewDialog } from '../views/SaveViewDialog';
import { ClaudePanel } from './ClaudePanel';
import { ExplorerResultsPanel } from './ExplorerResultsPanel';
import { type ClauseState, matchingClause, withClause, withoutClause } from './explorerQuery';
import { FieldsPanel } from './FieldsPanel';
import { QueryField } from './QueryField';
import { useFieldsPane } from './useFieldsPane';
import { useServiceKinds } from './useServiceKinds';
import { ViewFilterChips } from './ViewFilterChips';

/** The Claude panel's width bounds; its widest is half the window, set when it draws. */
const CLAUDE_WIDTH: WidthBounds = { min: 288, max: 1200, initial: 352, step: 32 };

/**
 * The Explorer (CONTEXT.md, Cloud Logs), shaped like the Cloud Console's Logs Explorer with Claude
 * beside it: the query bar, the fields the entries carry (resizable and hidable, kept), the chips of
 * the clauses the pane wrote, the results, and the Claude panel, whose context is the query, its
 * results and the selected entries. The bar follows the query that ran; one edited and not run yet
 * says so and dims the results, so what shows always matches the query that read it.
 */
export function CloudExplorerPanel(props: {
  filters: CloudFilters;
  conversation: CloudAsk | undefined;
  draft?: string;
  onFilters: (filters: CloudFilters) => void;
  onAsked: (asked: CloudAsked) => void;
  onNewConversation: () => void;
  onSession: (id: string) => void;
}) {
  const read = useOptional('logs.gcp', props.filters);
  const call = useCall();
  const toast = useToast();
  const { copy, copyText } = useCloudCopy();
  const cloudSession = useCloudSession(props.filters.env, props.onSession);
  const [query, setQuery] = useState(props.filters.filter ?? '');
  const ran = props.filters.filter ?? '';
  // A query set from outside (a view, a chip, Ask about this) shows in the bar; only a change does,
  // so an edit not run yet survives the tab being hidden and shown again (Activity).
  const [shownRan, setShownRan] = useState(ran);
  if (ran !== shownRan) {
    setShownRan(ran);
    setQuery(ran);
  }
  const pane = useFieldsPane();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<string>();
  const [claude, setClaude] = useLogsKept('explorer.claude', true);
  const [claudeKept, keepClaude] = useLogsKept('claude.width', CLAUDE_WIDTH.initial);
  const claudeBounds = {
    ...CLAUDE_WIDTH,
    max: Math.max(CLAUDE_WIDTH.min, Math.round(window.innerWidth / 2)),
  };
  const claudeWidth = clampWidth(claudeBounds, claudeKept);
  const [draft, setDraft] = useState(props.draft);
  const [saving, setSaving] = useState<CloudFilters>();
  // A query written from the person's words waits in the bar, highlighted, until they run it.
  const [written, setWritten] = useState(false);
  // The last entries read stay while the next query reads, so the panes do not blank.
  const last = useRef<CloudLogEntry[]>(undefined);
  if (read.data) last.current = read.data.entries;
  const entries = read.data?.entries ?? last.current;
  // The pages read, which the results list and the fields pane's context counts share.
  const older = useOlderEntries(entries, props.filters);
  // The range's counts by severity, service and time, from Cloud Monitoring where the query allows.
  const volume = useOptional('logs.volume', props.filters);
  const kinds = useServiceKinds(props.filters.env, volume.data);
  const service = useCloudLogsConfig().gcp?.service;
  const fields = useMemo(
    () => queryFields(older.entries, (ref) => kinds.get(ref) ?? undefined, { service }),
    [older.entries, kinds, service],
  );
  const apply = (filters: CloudFilters) => {
    setQuery(filters.filter ?? '');
    setWritten(false);
    props.onFilters(filters);
  };
  const run = (next: string) => apply({ ...props.filters, filter: next.trim() || undefined });
  const add = (clause: string, exclude = false) => run(withClause(query, clause, exclude));
  // A clause the fields pane sets: in, excluded, or taken out, on its own line of the query that
  // ran (what the pane and the chips show), so an edit not run yet is not run with it.
  const setClause = (clause: string, state?: ClauseState) => {
    const rest = withoutClause(ran, clause);
    run(state ? withClause(rest, clause, state === 'out') : rest);
  };
  const edited = !written && query.trim() !== ran.trim();
  const lastCited = props.conversation?.turns.at(-1)?.cited;
  const cited = useMemo(() => new Set(lastCited ?? []), [lastCited]);
  const picked = useMemo(() => [...selected], [selected]);
  // The rows keep one actions object; what it calls is read from here at the time of the click.
  const latest = useRef({ add, fix: cloudSession.fix, copy, copyText, setClaude });
  latest.current = { add, fix: cloudSession.fix, copy, copyText, setClaude };
  const actions = useMemo<EntryActions>(
    () => ({
      onSelect: (entry) =>
        setSelected((now) => {
          const next = new Set(now);
          if (!next.delete(entry.id)) next.add(entry.id);
          return next;
        }),
      onShow: (entry) => latest.current.add(matchingClause(entry)),
      onHide: (entry) => latest.current.add(matchingClause(entry), true),
      onAsk: (entry) => {
        setSelected(new Set([entry.id]));
        latest.current.setClaude(true);
        setDraft(`Explain this entry [${entry.id}]`);
      },
      onFix: (entry) => latest.current.fix(entryGroup(entry)),
      onCopy: (entry, format) => latest.current.copy([entry], format),
      onCopyText: (text, what) => latest.current.copyText(text, what),
    }),
    [],
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <QueryField
        query={query}
        fields={fields}
        busy={read.busy}
        written={written}
        edited={edited}
        onChange={setQuery}
        onRun={run}
        onWords={async (sentence) => {
          const found = await call('logs.query', { ...props.filters, sentence });
          if (!found.ok) return toast(found.error.message);
          setQuery(found.data.query);
          setWritten(true);
        }}
      />
      <ViewFilterChips
        filters={props.filters}
        query={ran}
        onFilters={props.onFilters}
        onQuery={run}
      />
      {read.busy && <ReadingBar />}
      <CloudReadAlert
        error={read.error}
        warnings={read.data?.warnings}
        onRetry={() => void read.refresh()}
      />
      <div
        // One row the height left, each pane scrolling on its own. On a narrow window the side panes
        // give way first and the results keep 24rem, so nothing is wider than the window.
        className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3"
        style={{
          gridTemplateColumns: [
            pane.hidden ? '' : `minmax(0, ${pane.width}px)`,
            'minmax(min(24rem, 100%), 1fr)',
            claude ? `minmax(0, ${claudeWidth}px)` : '',
          ].join(' '),
        }}
      >
        {!pane.hidden && (
          <div className="relative min-h-0 min-w-0 overflow-hidden rounded-lg border bg-card">
            <FieldsPanel
              entries={older.entries}
              volume={volume.data}
              since={props.filters.since}
              query={ran}
              env={props.filters.env}
              width={pane.width}
              columns={pane.columns}
              onSet={setClause}
              onPin={pane.pin}
              isOpen={pane.isOpen}
              onOpen={pane.setOpen}
              onHide={() => pane.setHidden(true)}
            />
            <ResizeHandle
              label="Resize fields"
              edge="right"
              width={pane.width}
              bounds={pane.bounds}
              keep={480}
              onWidth={pane.setWidth}
            />
          </div>
        )}
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <ExplorerResultsPanel
            read={entries}
            older={older}
            volume={volume.data}
            busy={read.busy}
            filters={props.filters}
            selected={selected}
            cited={cited}
            focus={focus}
            columns={pane.columns}
            stale={edited}
            actions={actions}
          />
          {pane.hidden && (
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 left-2 h-7"
              onClick={() => pane.setHidden(false)}
            >
              <PanelLeftOpen aria-hidden /> Fields
            </Button>
          )}
          {!claude && (
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2 h-7"
              onClick={() => setClaude(true)}
            >
              <PanelRightOpen aria-hidden /> Claude
            </Button>
          )}
        </div>
        {claude && (
          <div className="relative min-h-0 min-w-0 overflow-hidden rounded-lg border">
            <ResizeHandle
              label="Resize Claude"
              edge="left"
              width={claudeWidth}
              bounds={claudeBounds}
              keep={384 + (pane.hidden ? 0 : pane.width + 12) + 24}
              onWidth={(next) => keepClaude(clampWidth(claudeBounds, next))}
            />
            <ClaudePanel
              filters={props.filters}
              conversation={props.conversation}
              selected={picked}
              entry={entries?.find((e) => selected.has(e.id))}
              draft={draft}
              onAsked={(asked) => {
                setDraft(undefined);
                props.onAsked(asked);
              }}
              onNew={props.onNewConversation}
              onCite={setFocus}
              onApply={run}
              onRunOwn={(own) => apply(withOwn(props.filters, own))}
              onSaveView={(own) => setSaving(withOwn(props.filters, own))}
              onCarry={cloudSession.carry}
              onFix={cloudSession.fixAsk}
              onClose={() => setClaude(false)}
            />
          </div>
        )}
      </div>
      <CloudSessionDialogs session={cloudSession} />
      {saving !== undefined && (
        <SaveViewDialog filters={saving} onDone={() => setSaving(undefined)} />
      )}
    </div>
  );
}
