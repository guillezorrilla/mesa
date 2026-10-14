import { Check, Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StartStep = { label: string; state: 'todo' | 'now' | 'done' | 'failed' };

/**
 * Runs `plan` one step after another, reporting each step's state through `onSteps`; a step that
 * returns nothing (its error already toasted) stops the run. True when every step ran.
 */
export async function runSteps(
  plan: readonly { label: string; run: () => Promise<unknown> }[],
  onSteps: (steps: StartStep[]) => void,
) {
  let shown: StartStep[] = plan.map(({ label }) => ({ label, state: 'todo' }));
  const mark = (at: number, state: StartStep['state']) => {
    shown = shown.map((step, i) => (i === at ? { ...step, state } : step));
    onSteps(shown);
  };
  onSteps(shown);
  for (const [at, step] of plan.entries()) {
    mark(at, 'now');
    const ok = Boolean(await step.run());
    mark(at, ok ? 'done' : 'failed');
    if (!ok) return false;
  }
  return true;
}

/**
 * Each step of a start as it runs, then the session it opened, shown on its own (Open session
 * stays as a way back); Back when a step failed.
 */
export function StartProgress(props: {
  /** What is starting: "Starting LC-2", "Starting the review of #482". */
  title: string;
  steps: StartStep[];
  session?: string;
  onBack: () => void;
  onSession: (id: string) => void;
}) {
  const failed = props.steps.some((step) => step.state === 'failed');
  const done = props.steps.every((step) => step.state === 'done');
  const { session, onSession } = props;
  // Once: a re-render after the switch must not switch again.
  const shown = useRef<string>(undefined);
  useEffect(() => {
    if (!session || !done || shown.current === session) return;
    shown.current = session;
    onSession(session);
  }, [session, done, onSession]);
  return (
    <div className="grid gap-4 border-t bg-card px-6 py-5" data-testid="start-progress">
      <h3 className="text-[15px] font-semibold">{props.title}</h3>
      <ol className="grid gap-2.5">
        {props.steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              'flex items-center gap-2.5 text-sm',
              step.state === 'todo' && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-[18px] place-items-center rounded-full border',
                step.state === 'done' && 'border-state-idle bg-state-idle text-white',
                step.state === 'failed' && 'border-state-failed bg-state-failed text-white',
              )}
            >
              {step.state === 'done' && <Check aria-hidden className="size-3" />}
              {step.state === 'failed' && <X aria-hidden className="size-3" />}
              {step.state === 'now' && (
                <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
              )}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <div className="flex justify-end gap-2">
        {failed && (
          <Button variant="outline" onClick={props.onBack}>
            Back
          </Button>
        )}
        {session && <Button onClick={() => onSession(session)}>Open session</Button>}
      </div>
    </div>
  );
}
