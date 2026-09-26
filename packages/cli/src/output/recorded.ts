import type { Recorded } from '@mesa/core';
import type { Output } from '../command.js';

/**
 * A recorded action's output: `data` with its receipt, and its warning (core joins the action's
 * own and the receipt's) as one `warning` field and one last text line, so --json callers and
 * people see the same.
 */
export function recordedOutput<T>(
  recorded: Recorded<T>,
  out: { data: object; text: string },
): Output {
  const { warning } = recorded;
  return {
    data: { ...out.data, receipt: recorded.receipt, ...(warning ? { warning } : {}) },
    text: warning ? `${out.text}\nwarning: ${warning}` : out.text,
  };
}
