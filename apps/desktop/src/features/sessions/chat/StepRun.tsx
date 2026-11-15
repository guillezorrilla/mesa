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
    <li className="text-muted-foreground text-xs">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3 transition-transform group-open:rotate-90" />
          {run.text}
        </summary>
        <ol className="mt-1 ml-4 grid gap-0.5 font-mono">
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
