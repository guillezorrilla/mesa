import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * The turn being answered: the question, and the answer as it streams in, kept in view, or what
 * the run is doing while nothing has come yet.
 */
export function AskPendingTurn(props: { question: string; text: string }) {
  const turn = useRef<HTMLLIElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new piece of the answer scrolls it into view
  useEffect(() => {
    turn.current?.scrollIntoView?.({ block: 'end' });
  }, [props.text]);
  return (
    <li ref={turn} className="grid gap-2" aria-busy="true">
      <p className="justify-self-end rounded-lg bg-muted px-3 py-1.5 text-sm">{props.question}</p>
      {props.text ? (
        <p className="whitespace-pre-wrap text-sm leading-6">
          {props.text}
          <span
            aria-hidden
            className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60 align-middle"
          />
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          Reading the range, its errors and the code
        </p>
      )}
    </li>
  );
}
