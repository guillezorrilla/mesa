import { MacCallError } from '@mesa/core/phone';

/**
 * A read's answer, asked once more when the Mac did not answer in time: a loaded Mac answers
 * late, and a request lost in a redial is asked anew. Only for reads: a write asked twice could
 * act twice.
 */
export const againOnTimeout = <T>(ask: () => Promise<T>): Promise<T> =>
  ask().catch((error) => {
    if (error instanceof MacCallError && error.reason === 'timeout') return ask();
    throw error;
  });
