import type { TicketDefaults } from '@mesa/core';
import { useState } from 'react';
import { type StartOptions, useStartTicket } from '../useStartTicket';
import { StartBar } from './StartBar';
import { StartProgress } from './StartProgress';
import { StartSheet } from './StartSheet';

/**
 * Starting a session on one ticket, under it: Start session starts at once with the project's
 * defaults, Options opens the sheet to change them first, and the steps show as they run.
 */
export function TicketStart(props: {
  project: string;
  ticket: { key: string; url: string; mine: boolean; assignee?: string | undefined };
  defaults: TicketDefaults;
  /** The ticket prompt the project uses now. */
  prompt: string | null;
  onStarted: () => void;
  onSession: (id: string) => void;
}) {
  const { ticket, defaults } = props;
  const { steps, session, start, reset } = useStartTicket(props.project);
  const [customizing, setCustomizing] = useState(false);
  const [options, setOptions] = useState<StartOptions>({
    assign: defaults.assign && !ticket.mine,
    prompt: props.prompt,
    notes: defaults.notes,
    start: defaults.start,
    untilDone: defaults.untilDone,
  });
  const go = () => void start(ticket, options).then((ok) => ok && props.onStarted());
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
        ticket={ticket}
        options={options}
        onChange={(change) => setOptions((was) => ({ ...was, ...change }))}
        onCancel={() => setCustomizing(false)}
        onStart={go}
      />
    );
  return (
    <StartBar
      ticketKey={ticket.key}
      options={options}
      onStart={go}
      onCustomize={() => setCustomizing(true)}
    />
  );
}
