import { branchOf, type TicketStart } from '@mesa/core/browser';
import { useState } from 'react';
import { runSteps, type StartStep } from '@/components/StartProgress';
import { useRun } from '@/lib/useCommand';
import { placeOf, type StartOptions, type StartTicket } from './startOptions';
import { STARTS } from './starts';

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
    ticket: Pick<StartTicket, 'key' | 'id' | 'label' | 'several' | 'url'>,
    options: StartOptions,
    kind: TicketStart,
  ) => {
    const plan: { label: string; run: () => Promise<unknown> }[] = [];
    if (options.assign)
      plan.push({
        label: ticket.several ? `Add you to ${ticket.label}` : `Assign ${ticket.label} to you`,
        run: () => run('tickets.assign', { id: ticket.id }),
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
    return runSteps(plan, setSteps);
  };
  return { steps, session, startTicket, reset: () => setSteps(undefined) };
}
