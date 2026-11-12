import { FINAL_STATES, type PhoneRow } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

/** The sessions not over yet, which a new one may wait for (`--after`), as a promise to `use()`. */
export function useOpenSessions(): Promise<PhoneRow[]> {
  const link = useMac();
  const [rows] = useState(() =>
    link.call({ method: 'sessions' }).then(
      (r) => r.rows.filter((row) => !(FINAL_STATES as ReadonlySet<string>).has(row.state)),
      () => [],
    ),
  );
  return rows;
}
