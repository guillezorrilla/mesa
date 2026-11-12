import type { CallResult } from '@mesa/core/phone';
import { startTransition, useState } from 'react';
import { useMac } from '../mac/useMac';

export type HistoryRead = CallResult<'history'> & { query: string; error?: string };

/**
 * Past conversations across projects as a promise to `use()`, the newest or those found by the
 * text searched for (2 characters at least, as the Mac searches).
 */
export function useHistory() {
  const link = useMac();
  const read = (query: string): Promise<HistoryRead> =>
    link.call({ method: 'history', ...(query ? { query } : {}) }).then(
      (r) => ({ ...r, query }),
      (error: Error) => ({ conversations: [], partial: false, query, error: error.message }),
    );
  const [history, setHistory] = useState(() => read(''));
  const search = (text: string) => {
    const query = text.trim().length < 2 ? '' : text.trim();
    // The promise is made here, not in an updater, which React may run again while it suspends.
    const next = read(query);
    startTransition(() => setHistory(next));
  };
  return { history, search };
}
