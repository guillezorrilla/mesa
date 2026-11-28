import { stackView } from '@mesa/core/browser';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * An entry's stack, folded to its exception and the project's first own frame with "+N frames" for
 * the rest; framework frames dimmed. Each frame stays on one line and the block scrolls sideways.
 */
export function LogStack(props: { stack: string }) {
  const [open, setOpen] = useState(false);
  const view = useMemo(() => stackView(props.stack), [props.stack]);
  const lines = open ? view.lines : view.folded;
  return (
    <div className="mt-0.5 overflow-x-auto whitespace-pre [scrollbar-width:thin] [tab-size:2]">
      {lines.map((line, at) => (
        <div
          // Lines of one stack never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: a stack's lines are fixed, and may repeat.
          key={at}
          className={cn(
            line.framework
              ? 'text-muted-foreground/45'
              : line.frame
                ? 'text-foreground/75'
                : 'text-muted-foreground',
          )}
        >
          {line.text}
        </div>
      ))}
      {view.hidden > 0 && (
        <button
          type="button"
          className="font-sans text-[11px] text-state-working hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? 'Fold frames' : `+${view.hidden} frames`}
        </button>
      )}
    </div>
  );
}
