import type { AskTurn as Turn } from '@mesa/core';
import { BookmarkPlus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AskAnswer } from '../AskAnswer';

/** One turn of a conversation: the question, the answer with its citations, and the queries it ran. */
export function AskTurn(props: {
  turn: Turn;
  onCite: (id: string) => void;
  onApply: (query: string) => void;
  onSaveView: (filter: string) => void;
}) {
  const { turn } = props;
  return (
    <li className="grid gap-2">
      <p className="justify-self-end rounded-lg bg-muted px-3 py-1.5 text-sm">{turn.question}</p>
      <AskAnswer
        answer={turn.answer}
        cited={turn.cited}
        onCite={props.onCite}
        onApply={props.onApply}
      />
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
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => props.onApply(query.filter)}
                  >
                    <Play aria-hidden /> Run
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => props.onSaveView(query.filter)}
                  >
                    <BookmarkPlus aria-hidden /> Save as view
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}
