import type { CallResult } from '@mesa/core/phone';
import { useState, useTransition } from 'react';
import { useMac } from '../mac/useMac';

export type TicketsRead = CallResult<'tickets'> & { error?: string };

/** `project`'s followed tickets, read live from its tracker, as a promise to `use()`, and a refresh. */
export function useTickets(project: string) {
  const link = useMac();
  const read = (): Promise<TicketsRead> =>
    link.call({ method: 'tickets', project }).then(
      (r) => r,
      (error: Error) => ({ views: [], tickets: [], error: error.message }),
    );
  const [tickets, setTickets] = useState(read);
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => {
    const next = read();
    startRefresh(() => setTickets(next));
  };
  return { tickets, refresh, refreshing };
}
