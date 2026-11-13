import type { PhoneCall } from '@mesa/core/phone';
import { useOnFocus } from '@/lib/useOnFocus';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMacRead } from './useMacRead';

/** How often a tab's read is asked again while the app is in front. */
const EVERY_MS = 60_000;

/**
 * A tab's call as useMacRead reads it, asked again each time the tab comes into focus (back from
 * a screen that changed something) and every minute in front.
 */
export function useLiveRead<M extends PhoneCall['method']>(
  call: Extract<PhoneCall, { method: M }>,
) {
  const read = useMacRead(call);
  // ponytail: the first focus asks again right after the first read; skip it if the Mac strains.
  useOnFocus(read.again);
  useRepeatWhileActive(EVERY_MS, read.again);
  return read;
}
