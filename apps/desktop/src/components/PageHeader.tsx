import type { ReactNode } from 'react';

/** A screen's title, a line on what it shows, and its actions on the right. */
export function PageHeader(props: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">{props.title}</h2>
        {props.description && <p className="text-muted-foreground text-sm">{props.description}</p>}
      </div>
      {props.children && <div className="flex items-center gap-2">{props.children}</div>}
    </div>
  );
}
