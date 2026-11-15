import type { ChatRun } from '@mesa/core';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * What the agent did between two replies as one collapsed row ("Read 3 files, ran 2 commands"),
 * opening to its steps in time order.
 */
export function StepRun(props: { run: ChatRun }) {
  const { run } = props;
  return (
    <li className="text-[13px] text-muted-foreground">
      <details className="group">
        <summary className="-mx-1.5 inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-3.5 transition-transform group-open:rotate-90"
          />
          {run.text}
        </summary>
        <ol className="mt-1.5 ml-5 grid gap-1 font-mono text-xs">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className={cn('truncate', step.status === 'failed' && 'text-destructive')}
              title={step.line}
            >
              {step.line}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
