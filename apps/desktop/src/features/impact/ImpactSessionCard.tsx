import {
  answeredBy,
  counted,
  foldedText,
  type Moment,
  NO_OUTCOME,
  type SessionImpact,
} from '@mesa/core/browser';
import { useState } from 'react';
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
const time = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

function MomentRow({ moment: m }: { moment: Moment }) {
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-3 border-t py-2.5">
      <span className="pt-0.5 font-mono text-muted-foreground text-xs">{time(m.at)}</span>
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
      <span
        className={cn(
          'max-w-56 text-right text-xs',
          m.outcome && GOOD.has(m.outcome.kind) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {m.outcome?.text ?? NO_OUTCOME}
      </span>
    </li>
  );
}

/** A session's card: its thread, its Moments, and what folded quietly. */
export function ImpactSessionCard(props: {
  session: SessionImpact;
  expanded?: boolean;
  onSession?: (id: string) => void;
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
            <MomentRow key={m.id} moment={m} />
          ))}
        </ol>
      )}
      {!all && session.moments.length > COLLAPSED && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          Show all {session.moments.length}
        </Button>
      )}
      {folded && <p className="text-muted-foreground text-xs">{folded}</p>}
    </article>
  );
}
