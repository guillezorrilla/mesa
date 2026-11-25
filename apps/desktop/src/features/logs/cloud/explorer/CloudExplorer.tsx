import type { CloudAsk, CloudLogEntry } from '@mesa/core';
import { entryGroup, facetsOf } from '@mesa/core/browser';
import { PanelRightOpen } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ReadingBar } from '@/components/ReadingBar';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useCall, useOptional } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { CloudProjectDialog } from '../CloudProjectDialog';
import { CloudReadAlert } from '../CloudReadAlert';
import type { EntryActions } from '../types';
import { useCloudCopy } from '../useCloudCopy';
import { useFixInSession } from '../useFixInSession';
import { SaveViewDialog } from '../views/SaveViewDialog';
import { ClaudePanel } from './ClaudePanel';
import { ExplorerResults } from './ExplorerResults';
import { fieldClause, matchingClause, withClause } from './explorerQuery';
import { FieldsPane } from './FieldsPane';
import { QueryBar } from './QueryBar';
import { ViewFilterChips } from './ViewFilterChips';

/**
 * The Explorer (CONTEXT.md, Cloud Logs), shaped like the Cloud Console's Logs Explorer with Claude
 * beside it: the query bar, the fields the entries carry, the results, and the Claude panel, whose
 * context is the query, its results and the selected entries.
 */
export function CloudExplorer(props: {
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
  const fixing = useFixInSession(props.onSession);
  const [query, setQuery] = useState(props.filters.filter ?? '');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<string>();
  const [claude, setClaude] = useState(true);
  const [draft, setDraft] = useState(props.draft);
  const [saving, setSaving] = useState<string>();
  // The last entries read stay while the next query reads, so the panes do not blank.
  const last = useRef<CloudLogEntry[]>(undefined);
  if (read.data) last.current = read.data.entries;
  const entries = read.data?.entries ?? last.current;
  const facets = useMemo(() => facetsOf(entries ?? [], 20, 8), [entries]);
  const run = (next: string) => {
    setQuery(next);
    props.onFilters({ ...props.filters, filter: next.trim() || undefined });
  };
  const add = (clause: string, exclude = false) => run(withClause(query, clause, exclude));
  const lastCited = props.conversation?.turns.at(-1)?.cited;
  const cited = useMemo(() => new Set(lastCited ?? []), [lastCited]);
  const picked = useMemo(() => [...selected], [selected]);
  // The rows keep one actions object; what it calls is read from here at the time of the click.
  const latest = useRef({ add, fix: fixing.fix, copy, copyText });
  latest.current = { add, fix: fixing.fix, copy, copyText };
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
        setClaude(true);
        setDraft(`Explain this entry [${entry.id}]`);
      },
      onFix: (entry) => latest.current.fix(entryGroup(entry)),
      onField: (key, value) => latest.current.add(fieldClause(key, value)),
      onCopy: (entry, format) => latest.current.copy([entry], format),
      onCopyText: (text, what) => latest.current.copyText(text, what),
    }),
    [],
  );
  return (
    <div className="grid min-h-0 gap-3">
      <QueryBar
        query={query}
        facets={facets}
        busy={read.busy}
        onChange={setQuery}
        onRun={run}
        onWords={async (sentence) => {
          const found = await call('logs.query', { ...props.filters, sentence });
          if (found.ok) run(found.data.query);
          else toast(found.error.message);
        }}
      />
      <ViewFilterChips filters={props.filters} onFilters={props.onFilters} />
      {read.busy && <ReadingBar />}
      <CloudReadAlert
        error={read.error}
        warnings={read.data?.warnings}
        onRetry={() => void read.refresh()}
      />
      <div
        className={cn(
          'grid h-[68vh] min-h-0 grid-cols-[13rem_minmax(0,1fr)] gap-3',
          claude && 'grid-cols-[13rem_minmax(0,1fr)_22rem]',
        )}
      >
        <div className="min-h-0 overflow-hidden rounded-lg border bg-card">
          <FieldsPane entries={entries ?? []} onAdd={add} />
        </div>
        <div className="relative min-h-0">
          <ExplorerResults
            read={entries}
            busy={read.busy}
            filters={props.filters}
            selected={selected}
            cited={cited}
            focus={focus}
            actions={actions}
          />
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
          <div className="min-h-0 overflow-hidden rounded-lg border">
            <ClaudePanel
              filters={props.filters}
              conversation={props.conversation}
              selected={picked}
              draft={draft}
              onAsked={(asked) => {
                setDraft(undefined);
                props.onAsked(asked);
              }}
              onNew={props.onNewConversation}
              onCite={setFocus}
              onApply={run}
              onSaveView={setSaving}
              onClose={() => setClaude(false)}
            />
          </div>
        )}
      </div>
      {fixing.picking && (
        <CloudProjectDialog
          title="Fix in which project?"
          description="A session starts there with the entry and its query as its goal."
          remember={fixing.pickingRef}
          onCancel={fixing.cancel}
          onPick={(project, remember) => void fixing.pick(project, remember)}
        />
      )}
      {saving !== undefined && (
        <SaveViewDialog
          filters={{ ...props.filters, filter: saving }}
          onDone={() => setSaving(undefined)}
        />
      )}
    </div>
  );
}
