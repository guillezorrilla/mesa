import { useState } from 'react';
import { useRun } from '@/lib/useCommand';

/** How a session starts from a ticket: the start sheet's choices. */
export type StartOptions = {
  assign: boolean;
  /** A Saved prompt's name, or null for none. */
  prompt: string | null;
  notes: boolean;
  start: 'worktree' | 'checkout';
};

export type StartStep = { label: string; state: 'todo' | 'now' | 'done' | 'failed' };

/** The branch a ticket's worktree is on: its key in lowercase, such as hb-219. */
export const branchOf = (key: string) => key.toLowerCase();

/**
 * Starts a session from a ticket in `project`, one step after another: assign it (when asked),
 * import it (with notes when asked), then open the session from it with its goal, in a new
 * worktree on the ticket's branch or in the main checkout. `steps` is the progress the sheet
 * shows; a failed step stops there, its error already toasted.
 */
export function useStartTicket(project: string) {
  const run = useRun();
  const [steps, setSteps] = useState<StartStep[]>();
  const [session, setSession] = useState<string>();
  const start = async (ticket: { key: string; url: string }, options: StartOptions) => {
    const where =
      options.start === 'worktree'
        ? `in a new worktree on ${branchOf(ticket.key)}`
        : 'in the main checkout';
    const plan: { label: string; run: () => Promise<unknown> }[] = [];
    if (options.assign)
      plan.push({
        label: `Assign ${ticket.key} to you`,
        run: () => run('tickets.assign', { key: ticket.key }),
      });
    plan.push({
      label: options.notes ? 'Import the ticket and write its notes' : 'Import the ticket',
      run: () => run('imports.add', { project, links: [ticket.url], notes: options.notes }),
    });
    plan.push({
      label: `Start the session ${where}`,
      run: async () => {
        const built = await run('imports.goal', {
          project,
          from: ticket.key,
          prompt: options.prompt,
        });
        const opened =
          built &&
          (await run('sessions.open', {
            project,
            from: ticket.key,
            goal: built.goal,
            ...(options.start === 'worktree' ? { branch: branchOf(ticket.key) } : {}),
          }));
        if (opened) setSession(opened.id);
        return opened;
      },
    });
    setSession(undefined);
    let shown: StartStep[] = plan.map(({ label }) => ({ label, state: 'todo' }));
    const mark = (at: number, state: StartStep['state']) => {
      shown = shown.map((step, i) => (i === at ? { ...step, state } : step));
      setSteps(shown);
    };
    setSteps(shown);
    for (const [at, step] of plan.entries()) {
      mark(at, 'now');
      const ok = Boolean(await step.run());
      mark(at, ok ? 'done' : 'failed');
      if (!ok) return false;
    }
    return true;
  };
  return { steps, session, start, reset: () => setSteps(undefined) };
}
