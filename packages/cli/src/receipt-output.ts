import type { Recorded } from '@mesa/core';

/**
 * A recorded action's receipt for the envelope, with its warning (if any) in both the data and a
 * last text line, so --json callers see why a receipt is missing.
 */
export const withReceipt = <T>(recorded: Recorded<T>, text: string) => ({
  receipt: {
    receipt: recorded.receipt,
    ...(recorded.warning ? { warning: recorded.warning } : {}),
  },
  text: recorded.warning ? `${text}\nwarning: ${recorded.warning}` : text,
});
