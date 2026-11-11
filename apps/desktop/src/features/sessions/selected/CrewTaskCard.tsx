import { doingNow, inTurn, sendable, stoppable } from '@mesa/core/browser';
import { GitMerge, Play, Send, Square } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { StateIcon } from '../StateIcon';
import { type CrewCard, PHASE_STATE, type Phase, phaseWords } from './crewPlan';

/** The state words' colour by phase; the rest read muted. */
const WORDS: Partial<Record<Phase, string>> = {
  'needs-you': 'text-state-waiting',
  working: 'text-state-working',
  failed: 'text-state-failed',
};

/** What happened to the card's last Start or Merge into parent, said on it. */
export type CardOutcome = { text: string; failed: boolean };

/**
 * One Crew card (crewCards): its state icon, title (a link that opens its worker), state in words
 * and diff counts; what its worker is doing now, or its newest report once done; what else it
 * waits for, by task title; then Open worker and Message (a composer to it, `mesa send`), Merge
 * into parent and Stop, or Start for a ready task.
 */
export function CrewTaskCard(props: {
  card: CrewCard;
  now: number;
  composing: boolean;
  onCompose: () => void;
  onSend: (text: string, form: HTMLFormElement) => void;
  onOpen: (id: string) => void;
  onStop: () => void;
  merging: boolean;
  /** Start's or Merge's outcome; a merge that went through reads "merged" in the state words. */
  outcome?: CardOutcome;
  onMerge: () => void;
  /** Start for a ready task; none where it cannot start (no project). */
  onStart?: () => void;
  starting: boolean;
}) {
  const { card } = props;
  const worker = card.worker;
  // Start says nothing when it goes through, so an outcome that did not fail is a merge.
  const merged = Boolean(props.outcome && !props.outcome.failed);
  const doing = worker && doingNow(worker);
  const report = worker?.report;
  const also = card.phase === 'needs-you' && card.waitsFor.length > 0;
  return (
    <article
      data-testid="crew-card"
      data-phase={card.phase}
      className={cn(
        'mx-2 grid gap-2 rounded-lg border p-3',
        card.phase === 'working' && 'border-state-working/40 bg-state-working/5',
        !worker && 'border-dashed',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <StateIcon state={PHASE_STATE[card.phase]} className="mt-0.5 size-4" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          {worker ? (
            <button
              type="button"
              className="truncate text-left text-[13px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              title={`Open ${card.title}`}
              onClick={() => props.onOpen(worker.id)}
            >
              {card.title}
            </button>
          ) : (
            <span className="truncate text-[13px] font-medium">{card.title}</span>
          )}
          <span
            data-testid="crew-card-state"
            className={cn('text-xs', WORDS[card.phase] ?? 'text-muted-foreground')}
          >
            {phaseWords(card, props.now, merged)}
          </span>
        </div>
        {worker?.diff && <Stat className="text-[11px]" {...worker.diff} />}
      </div>
      {card.phase === 'working' && doing ? (
        <p className="ml-6.5 truncate font-mono text-xs text-state-working" title={doing}>
          Now: {doing}
        </p>
      ) : report ? (
        <p className="ml-6.5 line-clamp-2 whitespace-pre-line text-xs" title={report.message}>
          {report.message}
        </p>
      ) : (
        doing && <p className="ml-6.5 truncate text-xs text-muted-foreground">{doing}</p>
      )}
      {report?.details && (
        <p
          data-testid="crew-report-details"
          className="ml-6.5 truncate font-mono text-[11px] text-muted-foreground"
          title={report.details}
        >
          details: {report.details}
        </p>
      )}
      {(also || (!worker && card.phase !== 'done')) && (
        <p data-testid="crew-card-waits" className="ml-6.5 text-xs text-muted-foreground">
          {also && `Also waits for ${card.waitsFor.join(', ')}.`}
          {also && !worker && ' '}
          {!worker && 'No worker yet.'}
        </p>
      )}
      <div className="ml-6.5 flex min-w-0 items-center gap-3 text-xs">
        {worker && (
          <>
            <button
              type="button"
              className="text-state-working hover:underline"
              onClick={() => props.onOpen(worker.id)}
            >
              Open worker
            </button>
            <button
              type="button"
              aria-pressed={props.composing}
              disabled={!sendable(worker)}
              className="text-state-working hover:underline disabled:text-muted-foreground disabled:no-underline"
              onClick={props.onCompose}
            >
              Message
            </button>
            <span className="ml-auto flex items-center">
              <IconButton
                label={`Merge ${card.title} into parent`}
                icon={GitMerge}
                size="icon-xs"
                disabled={props.merging || !worker.branch || inTurn(worker)}
                onClick={props.onMerge}
              />
              <IconButton
                label={`Stop ${card.title}`}
                icon={Square}
                size="icon-xs"
                disabled={!stoppable(worker)}
                onClick={props.onStop}
              />
            </span>
          </>
        )}
        {card.task?.state === 'ready' && (
          <Button
            size="xs"
            variant="outline"
            aria-label={`Start ${card.title}`}
            disabled={!props.onStart || props.starting}
            title={props.onStart ? undefined : 'A General session has no project to start in'}
            onClick={props.onStart}
          >
            <Play aria-hidden /> Start
          </Button>
        )}
      </div>
      {props.outcome && (
        <p
          role={props.outcome.failed ? 'alert' : 'status'}
          className={cn(
            'ml-6.5 text-xs',
            props.outcome.failed ? 'text-state-failed' : 'text-muted-foreground',
          )}
        >
          {props.outcome.text}
        </p>
      )}
      {props.composing && worker && (
        <form
          className="ml-6.5 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const text = String(new FormData(event.currentTarget).get('prompt') ?? '');
            if (text.trim()) props.onSend(text, event.currentTarget);
          }}
        >
          <Textarea
            name="prompt"
            aria-label={`Message for ${card.title}`}
            placeholder={`Message ${card.title}`}
            rows={2}
            autoFocus
            className="min-h-9 flex-1 resize-y text-xs"
          />
          <Button type="submit" size="sm" aria-label={`Send to ${card.title}`}>
            <Send aria-hidden />
          </Button>
        </form>
      )}
    </article>
  );
}
