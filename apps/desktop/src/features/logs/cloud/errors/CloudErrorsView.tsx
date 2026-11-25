import type { CloudErrorGroup } from '@mesa/core';
import { groupKey } from '@mesa/core/browser';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CenteredState } from '@/components/CenteredState';
import { ReadingBar } from '@/components/ReadingBar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { AskAnswer } from '../AskAnswer';
import { CloudProjectDialog } from '../CloudProjectDialog';
import { CloudReadAlert } from '../CloudReadAlert';
import { ProdAskDialog } from '../ProdAskDialog';
import { useFixInSession } from '../useFixInSession';
import { useLogAsk } from '../useLogAsk';
import { CloudErrorGroupRow } from './CloudErrorGroupRow';
import { ErrorDetail } from './ErrorDetail';
import { type ErrorSort, errorItems, relatedOf } from './errorOrder';
import { IncidentCard } from './IncidentCard';

const SUMMARISE =
  "Summarise this range's errors as incidents in a few lines: for each, what fails, which services, since when and its likely origin, citing one entry each.";

/**
 * Errors (CONTEXT.md, Cloud Logs), master and detail: incidents and the groups in none on the left,
 * sorted by count, newest or biggest rise, New only on demand, and Summarise; the selection's
 * detail on the right (ErrorDetail).
 */
export function CloudErrorsView(props: {
  filters: CloudFilters;
  onAsk: (group: CloudErrorGroup) => void;
  onExplore: (query: CloudFilters) => void;
  onSession: (id: string) => void;
}) {
  const errors = useOptional('logs.errors', props.filters);
  const [sort, setSort] = useState<ErrorSort>('count');
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [summary, setSummary] = useState<CloudAsked>();
  const fixing = useFixInSession(props.onSession);
  const summarise = useLogAsk({ ...props.filters, severity: 'error' }, undefined, setSummary);
  const groups = errors.data?.groups;
  const incidents = errors.data?.incidents;
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
  return (
    <div className="grid min-h-0 gap-3">
      {errors.busy && <ReadingBar />}
      <CloudReadAlert
        error={errors.error}
        warnings={errors.data?.warnings}
        onRetry={() => void errors.refresh()}
      />
      <div className="grid min-h-[70vh] grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card">
        <div className="flex min-h-0 flex-col border-r">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 [&_[data-slot=native-select-wrapper]]:w-auto">
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
          </div>
          {summary && (
            <section aria-label="Summary" className="border-b bg-state-working/[0.04] px-3 py-2.5">
              <AskAnswer answer={summary.answer} cited={summary.cited} />
            </section>
          )}
          {items.length ? (
            <ul aria-label="Error groups" className="min-h-0 flex-1 overflow-y-auto">
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
                  <li key={item.key} className="border-b last:border-b-0">
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
                errors.busy
                  ? 'Reading error groups'
                  : newOnly
                    ? 'No new errors in this range.'
                    : 'No errors in this range.'
              }
            />
          )}
        </div>
        <div className="min-h-0 overflow-y-auto">
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
          ) : (
            <CenteredState message="Pick an error to see it here." />
          )}
        </div>
      </div>
      {fixing.picking && (
        <CloudProjectDialog
          title="Fix in which project?"
          description="A session starts there with the error, its samples and its query as its goal."
          remember={fixing.pickingRef}
          onCancel={fixing.cancel}
          onPick={(project, remember) => void fixing.pick(project, remember)}
        />
      )}
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
