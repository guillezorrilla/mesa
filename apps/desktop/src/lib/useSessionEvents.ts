import { useEffect, useRef } from 'react';
import { usePlatform } from './MesaRoot';
import { useWindowFocused } from './useWindowFocused';

/** The fallback look while the window is focused, and while it is not (#895). */
export const FOCUSED_POLL_MS = 10_000;
export const UNFOCUSED_POLL_MS = 30_000;

/**
 * Runs `run` now, whenever a hook event lands (the Rust watcher on `sessions/events/`, at most
 * about once a second), when the window gains or loses focus, and on a fallback poll for what no
 * hook writes: every 10 s while the window is focused, 30 s while it is not.
 */
export function useSessionEvents(run: () => void) {
  const { sessions } = usePlatform();
  const focused = useWindowFocused();
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void sessions
      .onChanged(() => {
        if (active) latest.current();
      })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [sessions]);
  useEffect(() => {
    latest.current();
    const timer = window.setInterval(
      () => latest.current(),
      focused ? FOCUSED_POLL_MS : UNFOCUSED_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [focused]);
}
