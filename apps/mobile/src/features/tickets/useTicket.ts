import type { PhoneTicketDetail } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

export type TicketRead = { ticket?: PhoneTicketDetail; error?: string };

/** Ticket `id` whole, read live from its tracker, as a promise to `use()`. */
export function useTicket(id: string, site?: string) {
  const link = useMac();
  const [read] = useState(
    (): Promise<TicketRead> =>
      link.call({ method: 'ticket', id, ...(site ? { site } : {}) }).then(
        (ticket) => ({ ticket }),
        (error: Error) => ({ error: error.message }),
      ),
  );
  return read;
}
