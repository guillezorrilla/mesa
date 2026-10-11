import type { ReactNode } from 'react';

/** One row of a ticket panel's fields: its name, then its value. */
export function FieldRow(props: { name: string; className?: string; children: ReactNode }) {
  return (
    <>
      <dt className="truncate text-muted-foreground" title={props.name}>
        {props.name}
      </dt>
      <dd className={props.className}>{props.children}</dd>
    </>
  );
}
