import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** A filter in effect, shown inside a filter field, with its own remove button. */
export function FilterChip(props: {
  children: ReactNode;
  /** Names the remove button for readers. */
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-state-working/12 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] text-state-working">
      {props.children}
      <button
        type="button"
        aria-label={props.removeLabel}
        className="rounded-sm p-0.5 hover:bg-state-working/15"
        onClick={props.onRemove}
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}
