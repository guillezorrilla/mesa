import { branchOf, type TicketStart } from '@mesa/core/browser';
import { useState } from 'react';
import { useRun } from '@/lib/useCommand';
import { placeOf, type StartOptions } from './startOptions';
import { STARTS } from './starts';

export type StartStep = { label: string; state: 'todo' | 'now' | 'done' | 'failed' };

/**
 * Starts a session from a ticket in `project`, one step after another: assign it (when asked),
 * import it (with notes when asked), then open the session from it with the goal its `kind` of
 * Ticket start builds, in a new worktree on the ticket's branch or in the main checkout. `steps`
 * is the progress StartProgress shows; a failed step stops there, its error already toasted.
 */
export function useStartTicket(project: string) {
  const run = useRun();
  const [steps, setSteps] = useState<StartStep[]>();
  const [session, setSession] = useState<string>();
  const startTicket = async (
    ticket: { key: string; url: string },
    options: StartOptions,
    kind: TicketStart,
  ) => {
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
      label: `${STARTS[kind].step} in ${placeOf(ticket.key, options.start)}`,
      run: async () => {
        const built = await run('imports.goal', {
          project,
          from: ticket.key,
          prompt: options.prompt,
          kind,
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
  return { steps, session, startTicket, reset: () => setSteps(undefined) };
}
