import type { ReactNode } from 'react';

/**
 * One step of a numbered guide: its number in a small circle, an optional title and one line, then
 * what the step holds (a field, a path to copy, a button).
 */
export function NumberedStep(props: {
  n: number;
  title?: string;
  line?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium text-muted-foreground tabular-nums"
      >
        {props.n}
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        {props.title && (
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">{props.title}</p>
            {props.line && <p className="text-sm text-muted-foreground">{props.line}</p>}
          </div>
        )}
        {props.children}
      </div>
    </li>
  );
}
