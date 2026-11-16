import type { KeyboardEvent } from 'react';

/**
 * The 0-based place a bare number key (1 to 9) picks in a numbered list; none for another key,
 * with a modifier, or typed into a field, where a digit is text.
 */
export function numberKey(event: KeyboardEvent): number | undefined {
  const { target } = event;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return undefined;
  if (event.metaKey || event.ctrlKey || event.altKey || !/^[1-9]$/.test(event.key))
    return undefined;
  return Number(event.key) - 1;
}
