import { REWATCH_MS, type UpdateMessage } from '@mesa/core/phone';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMac } from '../mac/useMac';

/** How often an open terminal asks for its output when its Mac does not push it (an older Mac). */
const EVERY_MS = 1000;

/**
 * Terminal session `id`'s output lines, from `first` (the session read): as the Mac pushes them
 * while its screen is watched (`pushed`, useSessionWatch), asked again every minute; from an older
 * Mac, asked every second while its screen is in front, one ask at a time. A failed ask keeps the
 * last lines.
 */
export function useTerminalOutput(id: string, first: string[], pushed: boolean) {
  const link = useMac();
  const [lines, setLines] = useState(first);
  const focused = useIsFocused();
  const asking = useRef(false);
  useRepeatWhileActive(pushed ? REWATCH_MS : EVERY_MS, () => {
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
  const onUpdate = useEffectEvent((update: UpdateMessage) => {
    const output = update.watched?.find((each) => each.id === id)?.output;
    if (output) setLines(output);
  });
  useEffect(() => link.onUpdate(onUpdate), [link]);
  return lines;
}
