import type { ReactNode } from 'react';

/** A numbered step's name over its field in a Follow dialog, such as 1 Repository. */
export function StepLabel(props: { step: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <b className="grid size-[18px] place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
        {props.step}
      </b>
      {props.children}
    </span>
  );
}
