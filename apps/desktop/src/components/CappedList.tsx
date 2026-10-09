import { type ReactNode, useState } from 'react';
import { Button } from './ui/button';

/** A list showing its first `cap` entries, with Show all and Show fewer when it has more. */
export function CappedList<T>(props: {
  items: readonly T[];
  cap: number;
  /** What the list holds, for its button: "Show all 37 notes". */
  noun: string;
  render: (item: T) => ReactNode;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const more = props.items.length > props.cap;
  return (
    <>
      <ul className={props.className}>
        {(all ? props.items : props.items.slice(0, props.cap)).map(props.render)}
      </ul>
      {more && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-full text-xs text-muted-foreground"
          onClick={() => setAll(!all)}
        >
          {all ? 'Show fewer' : `Show all ${props.items.length} ${props.noun}`}
        </Button>
      )}
    </>
  );
}
