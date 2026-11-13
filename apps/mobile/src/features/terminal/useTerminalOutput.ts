import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMac } from '../mac/useMac';

/** How often an open terminal asks for its output: what was typed shows within a second. */
const EVERY_MS = 1000;

/**
 * Terminal session `id`'s output lines, from `first` (the session read), asked again every second
 * while its screen is in front, one ask at a time; a failed ask keeps the last lines.
 */
// ponytail: polled, not pushed; push output in updateMessage if a second's lag or the broker's load matters.
export function useTerminalOutput(id: string, first: string[]) {
  const link = useMac();
  const [lines, setLines] = useState(first);
  const focused = useIsFocused();
  const asking = useRef(false);
  useRepeatWhileActive(EVERY_MS, () => {
    if (!focused || asking.current) return;
    asking.current = true;
    link
      .call({ method: 'output', id })
      .then(
        (output) => setLines(output.lines),
        () => undefined,
      )
      .finally(() => {
        asking.current = false;
      });
  });
  return lines;
}
