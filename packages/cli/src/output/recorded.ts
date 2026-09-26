import type { Recorded } from '@mesa/core';
import type { Output } from '../command.js';

/**
 * A recorded action's output: `data` with its receipt, and every warning (the action's own,
 * then the receipt's) joined into one `warning` field and one last text line, so --json callers
 * and people see the same.
 */
export function recordedOutput<T>(
  recorded: Recorded<T>,
  out: { data: object; text: string; warning?: string },
): Output {
  const warning = [out.warning, recorded.warning].filter(Boolean).join('; ');
  return {
    data: { ...out.data, receipt: recorded.receipt, ...(warning ? { warning } : {}) },
    text: warning ? `${out.text}\nwarning: ${warning}` : out.text,
  };
}
