import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

/** Runs `run` each time this screen comes into focus, the first time included. */
export function useOnFocus(run: () => void) {
  const focused = useIsFocused();
  const onFocus = useEffectEvent(run);
  useEffect(() => {
    if (focused) onFocus();
  }, [focused]);
}
