import type { TicketDefaults, TicketStart } from '@mesa/core/browser';
import { useState } from 'react';
import { useRun } from '@/lib/useCommand';
import { StartBar } from './StartBar';
import { StartProgress } from './StartProgress';
import { StartSheet } from './StartSheet';
import { initialOptions, type StartOptions, type StartTicket } from './startOptions';
import { useStartTicket } from './useStartTicket';

/**
 * Starting a session on one ticket, under it: each Ticket start button starts at once with the
 * project's defaults, Options opens the sheet to change them, and the steps show as they run. A
 * change in the sheet is saved as the project's default (the gear's settings), so every ticket
 * after this one starts the same way.
 */
export function TicketStartPanel(props: {
  project: string;
  ticket: StartTicket;
  defaults: TicketDefaults;
  /** The ticket prompt the project uses now: Your rules. */
  prompt: string | null;
  /** After a start or a saved option: the list reads again. */
  onChanged: () => void;
  onSession: (id: string) => void;
}) {
  const { ticket } = props;
  const { steps, session, startTicket, reset } = useStartTicket(props.project);
  const run = useRun();
  const [customizing, setCustomizing] = useState(false);
  const [options, setOptions] = useState<StartOptions>(() =>
    initialOptions(props.defaults, ticket, props.prompt),
  );
  const start = (kind: TicketStart) =>
    void startTicket(ticket, options, kind).then((ok) => ok && props.onChanged());
  const change = ({ prompt, ...defaults }: Partial<StartOptions>) => {
    setOptions((was) => ({ ...was, ...defaults, ...(prompt === undefined ? {} : { prompt }) }));
    const { project } = props;
    void Promise.all([
      Object.keys(defaults).length && run('tickets.defaults', { project, change: defaults }),
      // None clears the project's own prompt: the next ticket follows the profile's default, if any.
      prompt !== undefined &&
        run('tickets.prompt', { ...(prompt ? { name: prompt } : {}), project }),
    ]).then((saved) => saved.some(Boolean) && props.onChanged());
  };
  if (steps)
    return (
      <StartProgress
        ticketKey={ticket.key}
        steps={steps}
        session={session}
        onBack={reset}
        onSession={props.onSession}
      />
    );
  if (customizing)
    return (
      <StartSheet
        project={props.project}
        ticket={ticket}
        options={options}
        onChange={change}
        onCancel={() => setCustomizing(false)}
        onStart={start}
      />
    );
  return (
    <StartBar
      ticketKey={ticket.key}
      options={options}
      onStart={start}
      onCustomize={() => setCustomizing(true)}
    />
  );
}
