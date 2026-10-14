import {
  answeredBy,
  counted,
  foldedText,
  localClock,
  type Moment,
  NO_OUTCOME,
  type SessionImpact,
} from '@mesa/core/browser';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Each kind of Moment's colour: the Board's wait for a catch, the series' violet for notes. */
const SITE_DOT: Record<Moment['site'], string> = {
  supervision: 'bg-state-waiting',
  relevance: 'bg-[var(--series-7)]',
  guardrail: 'bg-state-failed',
  vault: 'bg-state-idle',
};

const GOOD = new Set(['hook-agreed', 'answered', 'not-overridden']);

/** The rows a card shows before Show all. */
const COLLAPSED = 3;

/** One dot per Moment on the session's own time line, first to last. */
function Thread({ moments }: { moments: Moment[] }) {
  const times = moments.map((m) => Date.parse(m.at));
  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  return (
    <div aria-hidden className="relative mx-2 h-4" data-testid="impact-thread">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {moments.map((m, i) => (
        <span
          key={m.id}
          className={cn(
            'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card',
            SITE_DOT[m.site],
          )}
          style={{ left: `${span ? (((times[i] ?? first) - first) / span) * 100 : 50}%` }}
        />
      ))}
    </div>
  );
}

/** Marks a Moment not right, or clears the mark (`undo`). */
type OnMark = (moment: string, undo: boolean) => void;

function MomentRow({ moment: m, onMark }: { moment: Moment; onMark?: OnMark }) {
  return (
    <li
      data-testid="impact-moment"
      className={cn(
        'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-3 border-t py-2.5',
        m.marked && 'opacity-60',
      )}
    >
      <span className="pt-0.5 font-mono text-muted-foreground text-xs">
        {localClock(new Date(m.at))}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2 font-medium text-sm">
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', SITE_DOT[m.site])} />
          <span className="truncate">{m.title}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {m.question} {answeredBy(m)}
          {m.rulesAlone && (
            <span className="ml-2 rounded border border-dashed px-1.5 py-px">
              Rules alone: {m.rulesAlone}
            </span>
          )}
        </p>
      </div>
      <div className="flex max-w-56 flex-col items-end gap-1 text-right text-xs">
        <span
          className={
            m.outcome && GOOD.has(m.outcome.kind) ? 'text-foreground' : 'text-muted-foreground'
          }
        >
          {m.outcome?.text ?? NO_OUTCOME}
        </span>
        {onMark &&
          (m.marked ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              Marked not right,
              <Button
                variant="link"
                size="xs"
                className="h-auto p-0"
                aria-label="Undo the mark"
                onClick={() => onMark(m.id, true)}
              >
                undo
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              aria-label="Mark as not right"
              className="text-muted-foreground"
              onClick={() => onMark(m.id, false)}
            >
              Not right
            </Button>
          ))}
      </div>
    </li>
  );
}

/** A session's card: its thread, its Moments, and what folded quietly. */
export function ImpactSessionCard(props: {
  session: SessionImpact;
  expanded?: boolean;
  onSession?: (id: string) => void;
  onMark?: OnMark;
}) {
  const { session } = props;
  const [all, setAll] = useState(props.expanded ?? false);
  const shown = all ? session.moments : session.moments.slice(-COLLAPSED);
  const folded = foldedText(session);
  return (
    <article
      data-testid="impact-session"
      aria-label={session.name}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <header className="flex flex-wrap items-baseline gap-2">
        {session.id && props.onSession ? (
          <Button
            variant="link"
            className="h-auto p-0 font-semibold text-base text-foreground"
            onClick={() => session.id && props.onSession?.(session.id)}
          >
            {session.name}
          </Button>
        ) : (
          <h3 className="font-semibold">{session.name}</h3>
        )}
        {session.project && (
          <span className="text-muted-foreground text-sm">{session.project}</span>
        )}
        <span className="ml-auto text-muted-foreground text-xs">
          {counted(session.moments.length, 'moment')}
        </span>
      </header>
      {session.moments.length > 0 && <Thread moments={session.moments} />}
      {shown.length > 0 && (
        <ol>
          {shown.map((m) => (
            <MomentRow key={m.id} moment={m} onMark={props.onMark} />
          ))}
        </ol>
      )}
      {!all && session.moments.length > COLLAPSED && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          Show all {session.moments.length}
        </Button>
      )}
      {folded && <Muted size="xs">{folded}</Muted>}
    </article>
  );
}
