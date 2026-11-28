import type { AskOwn, AskTurn as Turn } from '@mesa/core';
import { duration, modelLabel, money } from '@mesa/core/browser';
import { BookmarkPlus, Play, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AskAnswerPanel } from '../AskAnswerPanel';

/** What a turn's run was: its model, how long it took, what it cost, and the code it read. */
const runLine = (turn: Turn) =>
  [
    turn.model && modelLabel(turn.model),
    turn.durationMs !== undefined && duration(Math.round(turn.durationMs / 1000)),
    turn.costUsd !== undefined && money(turn.costUsd),
    turn.code && `read ${turn.code}`,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * One turn of a conversation: the question, the answer with its citations, the run's model, time
 * and cost, Fix in session, and the queries it ran; Run and Save as view take a query's own
 * filters, so the view keeps its env and range.
 */
export function AskTurnPanel(props: {
  turn: Turn;
  onCite: (id: string) => void;
  onApply: (query: string) => void;
  /** Sets the filters a query ran with, as the person would (its own part, not its compiled env and range). */
  onRunOwn: (own: AskOwn) => void;
  onSaveView: (own: AskOwn) => void;
  /** Starts a session that carries the investigation on and fixes what it found. */
  onFix: () => void;
}) {
  const { turn } = props;
  const run = runLine(turn);
  return (
    <li className="grid gap-2">
      <p className="justify-self-end rounded-lg bg-muted px-3 py-1.5 text-sm">{turn.question}</p>
      <AskAnswerPanel
        answer={turn.answer}
        cited={turn.cited}
        onCite={props.onCite}
        onApply={props.onApply}
      />
      <div className="flex items-center gap-2">
        {run && (
          <span className="truncate text-[11px] text-muted-foreground tabular-nums">{run}</span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto h-6" onClick={props.onFix}>
          <Wrench aria-hidden /> Fix in session
        </Button>
      </div>
      {turn.queries.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {turn.queries.length} {turn.queries.length === 1 ? 'query' : 'queries'} run
          </summary>
          <ol className="mt-1 grid gap-1.5">
            {turn.queries.map((query, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one turn's queries, in order
              <li key={i} className="grid gap-1 rounded-md border bg-muted/30 p-2">
                <code className="line-clamp-3 font-mono text-[11px] [overflow-wrap:anywhere]">
                  {query.project ? `${query.project}: ` : ''}
                  {query.filter}
                </code>
                {query.own && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6"
                      onClick={() => query.own && props.onRunOwn(query.own)}
                    >
                      <Play aria-hidden /> Run
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6"
                      onClick={() => query.own && props.onSaveView(query.own)}
                    >
                      <BookmarkPlus aria-hidden /> Save as view
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}
