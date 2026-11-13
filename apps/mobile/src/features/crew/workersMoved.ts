import type { PhoneCrew, PhoneRow } from '@mesa/core/phone';

/** Whether any of the crew's workers is in `rows` (an update the Mac pushed) in another state. */
export const workersMoved = (crew: PhoneCrew | undefined, rows: readonly PhoneRow[]) =>
  Boolean(
    crew?.workers.some((worker) =>
      rows.some((row) => row.id === worker.id && row.state !== worker.state),
    ),
  );
