import { OUTPUT_LINES, REWATCH_MS } from '@mesa/core/phone';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { useOnFocus } from '@/lib/useOnFocus';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMac } from '../mac/useMac';
import { useMacUpdates } from '../mac/useMacUpdates';

/** How often an open output asks for its lines when its Mac does not push them. */
const EVERY_MS = 1000;

type Output = { lines: string[]; more: boolean };

/**
 * Session `id`'s output lines with their colours, from `first` (the session read, plain), asked
 * again when its screen comes into focus: as the Mac pushes them while its screen is watched
 * (`pushed`, useSessionWatch), asked again every minute; otherwise (an agent's output, an older
 * Mac) asked every second while in front, one ask at a time. A failed ask keeps the last lines.
 * `older` asks a page more for the scrollback; `hold` keeps the lines shown still while the
 * person reads back (newer ones still arrive, shown once let go), and letting go drops the pages.
 */
export function useTerminalOutput(id: string, first: string[], pushed: boolean) {
  const link = useMac();
  const focused = useIsFocused();
  // Whether older lines exist is unknown until the Mac says.
  const [latest, setLatest] = useState<Output>({ lines: first, more: true });
  const [held, setHeld] = useState<Output>();
  const [loading, setLoading] = useState(false);
  // How many lines the scrollback holds: a page more for each `older`.
  const count = useRef(OUTPUT_LINES.first);
  const asking = useRef(false);
  const ask = (lines: number) => link.call({ method: 'output', id, lines, colour: true });
  const refresh = () => {
    if (!focused || asking.current) return;
    asking.current = true;
    ask(OUTPUT_LINES.first)
      .then(setLatest, () => undefined)
      .finally(() => {
        asking.current = false;
      });
  };
  useOnFocus(refresh);
  useRepeatWhileActive(pushed ? REWATCH_MS : EVERY_MS, refresh);
  useMacUpdates((update) => {
    const lines = update.watched?.find((each) => each.id === id)?.output;
    if (lines) setLatest((last) => ({ lines, more: last.more }));
  });
  const older = () => {
    if (loading || count.current >= OUTPUT_LINES.most) return;
    const lines = Math.min(count.current + OUTPUT_LINES.page, OUTPUT_LINES.most);
    setLoading(true);
    ask(lines)
      .then(
        (output) => {
          count.current = lines;
          setLatest(output);
          setHeld((shown) => shown && output);
        },
        () => undefined,
      )
      .finally(() => setLoading(false));
  };
  const hold = (yes: boolean) => {
    if (!yes) count.current = OUTPUT_LINES.first;
    setHeld(yes ? latest : undefined);
  };
  const shown = held ?? latest;
  return { ...shown, loading, older, held: held !== undefined, hold };
}
