import type { CloudErrorGroup } from '@mesa/core';
import { groupKey } from '@mesa/core/browser';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { CenteredState } from '@/components/CenteredState';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { AskAnswer } from '../AskAnswer';
import { CloudReadAlert } from '../CloudReadAlert';
import { CloudSessionDialogs } from '../CloudSessionDialogs';
import { ProdAskDialog } from '../ProdAskDialog';
import { useCloudSession } from '../useCloudSession';
import { useLogAsk } from '../useLogAsk';
import { CloudErrorGroupRow } from './CloudErrorGroupRow';
import { ErrorDetail } from './ErrorDetail';
import { ErrorsSkeleton } from './ErrorsSkeleton';
import { ErrorsStatus } from './ErrorsStatus';
import { type ErrorSort, errorItems, relatedOf } from './errorOrder';
import { IncidentCard } from './IncidentCard';

const SUMMARISE =
  "Summarise this range's errors as incidents in a few lines: for each, what fails, which services, since when and its likely origin, citing one entry each.";

/**
 * Errors (CONTEXT.md, Cloud Logs), master and detail filling the tab: incidents and the groups in
 * none on the left, sorted by count, newest or biggest rise, New only on demand, Summarise and
 * Refresh; the selection's detail on the right (ErrorDetail); each pane scrolls on its own. While a
 * read runs, the last result stays, dimmed, under a status line with Cancel; the first read shows
 * skeleton rows.
 */
export function CloudErrorsView(props: {
  filters: CloudFilters;
  /** Names the read in the status line: its projects and env. */
  reading: string;
  onAsk: (group: CloudErrorGroup) => void;
  onExplore: (query: CloudFilters) => void;
  onSession: (id: string) => void;
}) {
  const errors = useOptional('logs.errors', props.filters);
  const [sort, setSort] = useState<ErrorSort>('count');
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [summary, setSummary] = useState<CloudAsked>();
  const [cancelled, setCancelled] = useState<string>();
  const fixing = useCloudSession(props.filters.env, props.onSession);
  const summarise = useLogAsk({ ...props.filters, severity: 'error' }, undefined, setSummary);
  // The last result stays shown, dimmed, while another reads (or after Cancel).
  const readKey = JSON.stringify(props.filters);
  const last = useRef(errors.data);
  if (errors.data && cancelled !== readKey) last.current = errors.data;
  const shown = cancelled === readKey ? last.current : (errors.data ?? last.current);
  const waiting = errors.busy && cancelled !== readKey;
  const stale = waiting && shown !== errors.data;
  const groups = shown?.groups;
  const incidents = shown?.incidents;
  const byKey = useMemo(() => new Map((groups ?? []).map((g) => [groupKey(g), g])), [groups]);
  const items = useMemo(
    () => errorItems(byKey, incidents ?? [], sort, newOnly),
    [byKey, incidents, sort, newOnly],
  );
  const first = items[0];
  const chosenKey =
    selected && byKey.has(selected)
      ? selected
      : first?.kind === 'incident'
        ? first.incident.origin
        : first?.key;
  const chosen = chosenKey ? byKey.get(chosenKey) : undefined;
  const related = useMemo(
    () => (chosenKey ? relatedOf(chosenKey, incidents ?? [], byKey) : []),
    [chosenKey, incidents, byKey],
  );
  const refresh = () => {
    setCancelled(undefined);
    void errors.refresh();
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {waiting && (
        <ErrorsStatus
          what={`Reading and grouping ${props.reading} errors`}
          onCancel={() => setCancelled(readKey)}
        />
      )}
      <CloudReadAlert error={errors.error} warnings={shown?.warnings} onRetry={refresh} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card">
        <section aria-label="Errors list" className="flex min-h-0 flex-col border-r">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 [&_[data-slot=native-select-wrapper]]:w-auto">
            <NativeSelect
              aria-label="Sort errors"
              size="sm"
              className="text-xs"
              value={sort}
              onChange={(event) => setSort(event.currentTarget.value as ErrorSort)}
            >
              <NativeSelectOption value="count">Most errors</NativeSelectOption>
              <NativeSelectOption value="newest">Newest</NativeSelectOption>
              <NativeSelectOption value="rise">Biggest rise</NativeSelectOption>
            </NativeSelect>
            <Label className="gap-1.5 text-xs font-normal text-muted-foreground">
              <Switch checked={newOnly} onCheckedChange={setNewOnly} /> New only
            </Label>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7"
              disabled={summarise.busy || !groups?.length}
              onClick={() => void summarise.ask(SUMMARISE)}
            >
              <Sparkles aria-hidden /> {summarise.busy ? 'Summarising' : 'Summarise'}
            </Button>
            <IconButton label="Refresh" icon={RefreshCw} onClick={refresh} />
          </div>
          {summary && (
            <section
              aria-label="Summary"
              className="shrink-0 border-b bg-state-working/[0.04] px-4 py-3"
            >
              <AskAnswer answer={summary.answer} cited={summary.cited} />
            </section>
          )}
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto transition-opacity',
              stale && 'opacity-50',
            )}
          >
            {!shown ? (
              waiting ? (
                <ErrorsSkeleton part="list" />
              ) : (
                <CenteredState message="Errors read here once the range is read." />
              )
            ) : items.length ? (
              <ul aria-label="Error groups" className="divide-y">
                {items.map((item) =>
                  item.kind === 'incident' ? (
                    <IncidentCard
                      key={item.incident.id}
                      incident={item.incident}
                      members={item.members}
                      selected={chosenKey}
                      onSelect={setSelected}
                    />
                  ) : (
                    <li key={item.key}>
                      <CloudErrorGroupRow
                        group={item.group}
                        selected={chosenKey === item.key}
                        onSelect={() => setSelected(item.key)}
                      />
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <CenteredState
                message={
                  newOnly
                    ? 'No new errors in this range.'
                    : 'No errors in this range. Widen the range or pick another env.'
                }
              />
            )}
          </div>
        </section>
        <div className={cn('min-h-0 overflow-y-auto transition-opacity', stale && 'opacity-50')}>
          {chosen ? (
            <ErrorDetail
              key={chosenKey}
              group={chosen}
              related={related}
              filters={props.filters}
              onSelect={setSelected}
              onAsk={props.onAsk}
              onFix={fixing.fix}
              onExplore={props.onExplore}
            />
          ) : waiting && !shown ? (
            <ErrorsSkeleton part="detail" />
          ) : (
            <CenteredState
              message={shown ? 'Pick an error on the left to see it here.' : 'Nothing read yet.'}
            />
          )}
        </div>
      </div>
      <CloudSessionDialogs session={fixing} />
      {summarise.confirming && (
        <ProdAskDialog
          projects={summarise.confirming}
          onConfirm={() => void summarise.confirm()}
          onCancel={summarise.cancel}
        />
      )}
    </div>
  );
}
