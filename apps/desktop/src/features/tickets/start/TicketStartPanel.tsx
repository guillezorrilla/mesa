import type { TicketDefaults, TicketStart } from '@mesa/core/browser';
import { useState } from 'react';
import { StartProgress } from '@/components/StartProgress';
import { useTicketSettings } from '../useTicketSettings';
import { StartBar } from './StartBar';
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
  const settings = useTicketSettings(props.project, props.onChanged);
  const [customizing, setCustomizing] = useState(false);
  // The project's defaults as last read, under what was changed here: a ticket opened before the
  // list read a saved change again picks it up once the read lands.
  const [changed, setChanged] = useState<Partial<StartOptions>>({});
  const options = { ...initialOptions(props.defaults, ticket, props.prompt), ...changed };
  const start = (kind: TicketStart) =>
    void startTicket(ticket, options, kind).then((ok) => ok && props.onChanged());
  const change = (change: Partial<StartOptions>) => {
    setChanged((was) => ({ ...was, ...change }));
    const { prompt, ...defaults } = change;
    if (Object.keys(defaults).length) settings.setDefault(defaults);
    // None clears the project's own prompt: the next ticket follows the shared one, if any.
    if (prompt !== undefined) settings.setPrompt(prompt);
  };
  if (steps)
    return (
      <StartProgress
        title={`Starting ${ticket.label}`}
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
        onClose={() => setCustomizing(false)}
        onStart={start}
      />
    );
  return (
    <StartBar
      ticket={ticket}
      options={options}
      onChange={change}
      onStart={start}
      onCustomize={() => setCustomizing(true)}
    />
  );
}
