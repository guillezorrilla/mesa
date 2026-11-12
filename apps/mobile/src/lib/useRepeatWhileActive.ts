import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

/** Runs `run` every `ms` while the app is in front, and again each time it comes back. */
export function useRepeatWhileActive(ms: number, run: () => void) {
  const tick = useEffectEvent(run);
  useEffect(() => {
    let timer = setInterval(tick, ms);
    const change = AppState.addEventListener('change', (state) => {
      clearInterval(timer);
      if (state !== 'active') return;
      tick();
      timer = setInterval(tick, ms);
    });
    return () => {
      clearInterval(timer);
      change.remove();
    };
  }, [ms]);
}
