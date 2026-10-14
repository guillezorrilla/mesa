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
