import type { TicketDefaults, TicketStart } from '@mesa/core/browser';
import { useState } from 'react';
import { StartBar } from './StartBar';
import { StartProgress } from './StartProgress';
import { StartSheet } from './StartSheet';
import { initialOptions, type StartOptions, type StartTicket } from './startOptions';
import { useStartTicket } from './useStartTicket';

/**
 * Starting a session on one ticket, under it: each Ticket start button starts at once with the
 * project's defaults, Options opens the sheet to change them first, and the steps show as they run.
 */
export function TicketStartPanel(props: {
  project: string;
  ticket: StartTicket;
  defaults: TicketDefaults;
  /** The ticket prompt the project uses now: Your rules. */
  prompt: string | null;
  onStarted: () => void;
  onSession: (id: string) => void;
}) {
  const { ticket } = props;
  const { steps, session, startTicket, reset } = useStartTicket(props.project);
  const [customizing, setCustomizing] = useState(false);
  const [options, setOptions] = useState<StartOptions>(() =>
    initialOptions(props.defaults, ticket, props.prompt),
  );
  const start = (kind: TicketStart) =>
    void startTicket(ticket, options, kind).then((ok) => ok && props.onStarted());
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
        onChange={(change) => setOptions((was) => ({ ...was, ...change }))}
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
