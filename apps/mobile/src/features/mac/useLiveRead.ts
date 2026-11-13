import type { PhoneCall } from '@mesa/core/phone';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
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
  const focused = useIsFocused();
  const onFocus = useEffectEvent(read.again);
  // ponytail: the first focus asks again right after the first read; skip it if the Mac strains.
  useEffect(() => {
    if (focused) onFocus();
  }, [focused]);
  useRepeatWhileActive(EVERY_MS, read.again);
  return read;
}
