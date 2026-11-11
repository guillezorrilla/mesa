import type { TreeRow } from '@mesa/core';
import { RefreshCw, Users, X } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { useCall, useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { stateTone } from '../stateTone';
import { CrewChoices } from './CrewChoices';
import { CrewSetups } from './CrewSetups';
import { type CardOutcome, CrewTaskCard } from './CrewTaskCard';
import { type CrewCard, crewCards, crewSummary, PHASE_STATE } from './crewPlan';
import { useRefreshOnStamp } from './useRefreshOnStamp';

/** What the Crew panel does to a child: the Sessions screen's own send, stop and select. */
export type CrewActions = {
  send: (id: string, prompt: string, form: HTMLFormElement) => void;
  stop: (id: string) => void;
  select: (id: string) => void;
  /** A session's Setup sessions on the Board (CONTEXT.md, Worktree). */
  setupsOf: (id: string) => readonly TreeRow[];
};

/**
 * A parent's crew beside its terminal (CONTEXT.md, Crew), at a glance: a header counting its
 * cards by state over a bar with one segment per task (per worker with no tasks); what waits on the person first (CrewChoices:
 * open decision gates on its tasks, open questions from its workers); then one card per task in
 * plan order with its worker folded in, and one per worker with no task (crewCards,
 * CrewTaskCard); then its branches and setup, folded (CrewSetups). A new `stamp` (a child's state
 * changed on the Board) reads it all again.
 */
export function CrewPanel(props: {
  sessionId: string;
  /** Its project, where a task's worker starts; none for a General session. */
  project?: string;
  stamp: string;
  actions: CrewActions;
  onClose: () => void;
}) {
  const crew = useCommand('sessions.crew', { id: props.sessionId });
  const listed = useCommand('tasks.list', { coordinator: props.sessionId });
  const gates = useCommand('gates.list');
  const asked = useCommand('reports.questions', { session: props.sessionId });
  const call = useCall();
  const [composing, setComposing] = useState<string>();
  const [stopping, setStopping] = useState<CrewCard>();
  const [busy, setBusy] = useState<string>();
  /** Each card's last Start or Merge outcome, by its key. */
  const [outcomes, setOutcomes] = useState<Record<string, CardOutcome>>({});
  /** Why the last gate option did not resolve its gate (resolved elsewhere first). */
  const [gateRefused, setGateRefused] = useState<string>();
  const refresh = async () => {
    await Promise.all([crew.refresh(), listed.refresh(), gates.refresh(), asked.refresh()]);
  };
  useRefreshOnStamp(props.stamp, refresh);
  const said = (key: string, outcome?: CardOutcome) =>
    setOutcomes(({ [key]: _gone, ...rest }) => (outcome ? { ...rest, [key]: outcome } : rest));
  const tasks = listed.data?.tasks ?? [];
  const mine = new Set(tasks.map((task) => task.id));
  const open = (gates.data?.gates ?? []).filter((gate) => mine.has(gate.task));
  const questions = (asked.data?.questions ?? []).filter((question) => !question.answer);
  const rows = crew.data;
  const cards = crewCards(
    tasks,
    rows ?? [],
    new Set(open.map((gate) => gate.task)),
    new Set(questions.map((question) => question.child)),
  );
  // One segment per task, or per worker when there are no tasks.
  const bar = tasks.length ? cards.filter((card) => card.task) : cards;
  const merge = async (card: CrewCard) => {
    if (!card.worker) return;
    setBusy(card.key);
    const done = await call('sessions.merge', { id: card.worker.id });
    setBusy(undefined);
    said(
      card.key,
      !done.ok
        ? { text: done.error.message, failed: true }
        : done.data.merged
          ? { text: `Merged ${done.data.branch} into this session`, failed: false }
          : {
              text: `Not merged: ${done.data.conflicts.join(', ')} conflict; the merge was aborted`,
              failed: true,
            },
    );
    await crew.refresh();
  };
  const start = async (card: CrewCard) => {
    if (!props.project || !card.task) return;
    setBusy(card.key);
    const started = await call('tasks.start', {
      id: card.task.id,
      project: props.project,
      parent: props.sessionId,
    });
    setBusy(undefined);
    said(card.key, started.ok ? undefined : { text: started.error.message, failed: true });
    await Promise.all([listed.refresh(), crew.refresh()]);
  };
  const now = Date.now();
  return (
    <aside
      aria-label="Crew"
      className="flex h-full w-96 min-h-0 shrink-0 flex-col border-l bg-card"
    >
      <header className="grid shrink-0 gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Users aria-hidden className="size-4 shrink-0 text-state-working" />
          <span className="text-sm font-medium">Crew</span>
          <span data-testid="crew-summary" className="truncate text-xs text-muted-foreground">
            {crewSummary(cards)}
          </span>
          <span className="ml-auto" />
          <IconButton
            label="Refresh crew"
            icon={RefreshCw}
            disabled={crew.busy}
            className={cn(crew.busy && '[&_svg]:animate-spin')}
            onClick={() => void refresh()}
          />
          <IconButton label="Close crew" icon={X} onClick={props.onClose} />
        </div>
        {bar.length > 0 && (
          <div
            aria-hidden
            data-testid="crew-bar"
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(0, 1fr))` }}
          >
            {bar.map((card) => (
              <span
                key={card.key}
                data-phase={card.phase}
                className={cn('h-1.5 rounded-full', stateTone(PHASE_STATE[card.phase]).fill)}
              />
            ))}
          </div>
        )}
      </header>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto pb-3">
        <CrewChoices
          gates={open}
          questions={questions}
          cards={cards}
          onGateDone={async (refused) => {
            setGateRefused(refused);
            await refresh();
          }}
          onAnswered={(id) =>
            asked.mutate((list) => ({
              ...list,
              questions: list.questions.filter((question) => question.id !== id),
            }))
          }
        />
        {gateRefused && (
          <p role="alert" className="mx-3 text-xs text-state-failed">
            {gateRefused}
          </p>
        )}
        {!rows ? (
          <Muted className="px-3 py-2">{crew.error ? 'Could not read the crew' : 'Reading'}</Muted>
        ) : !cards.length ? (
          <Muted className="px-3 py-2">No workers yet. Start one with New worker.</Muted>
        ) : (
          <section aria-label="Plan" data-testid="session-crew" className="grid gap-1.5">
            <SectionLabel className="px-3 pt-2">Plan</SectionLabel>
            {cards.map((card) => (
              <CrewTaskCard
                key={card.key}
                card={card}
                now={now}
                composing={composing === card.key}
                onCompose={() => setComposing(composing === card.key ? undefined : card.key)}
                onSend={(text, form) =>
                  card.worker && props.actions.send(card.worker.id, text, form)
                }
                onOpen={props.actions.select}
                onStop={() => setStopping(card)}
                merging={busy === card.key}
                outcome={outcomes[card.key]}
                onMerge={() => void merge(card)}
                onStart={props.project ? () => void start(card) : undefined}
                starting={busy === card.key}
              />
            ))}
          </section>
        )}
        <CrewSetups
          workers={(rows ?? []).filter((row) => cards.some((card) => card.worker?.id === row.id))}
          setupsOf={props.actions.setupsOf}
          onOpen={props.actions.select}
        />
      </div>
      {stopping?.worker && (
        <ActionDialog
          testId="crew-stop-dialog"
          title={`Stop ${stopping.title}?`}
          description="Its agent ends now. Its worktree, branch and reports stay."
          submit={{
            label: 'Stop',
            testId: 'crew-stop-confirm',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => {
            if (stopping.worker) props.actions.stop(stopping.worker.id);
            setStopping(undefined);
          }}
          onCancel={() => setStopping(undefined)}
        />
      )}
    </aside>
  );
}
