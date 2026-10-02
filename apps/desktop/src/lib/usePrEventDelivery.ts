import type { TreeRow } from '@mesa/core';
import { useEffect, useRef } from 'react';
import { useCall } from './useCommand';

/** How often the app forwards PR events while nothing else asks it to. */
export const PR_EVENTS_INTERVAL_MS = 60_000;

/**
 * While `enabled` (the profile's `sessions.prEvents`), forwards PR events into idle sessions on an
 * interval and whenever a session goes idle. Core decides which sessions take them; a failed pass
 * is quiet, and the next one tries again.
 */
export function usePrEventDelivery(enabled: boolean, sessions: readonly TreeRow[]) {
  const call = useCall();
  const busy = useRef(false);
  const deliver = useRef(async () => {});
  deliver.current = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await call('prEvents.deliver');
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    if (!enabled) return;
    void deliver.current();
    const timer = window.setInterval(() => void deliver.current(), PR_EVENTS_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
  const idle = sessions
    .filter((row) => row.lastState.state === 'idle')
    .map((row) => row.id)
    .sort()
    .join(' ');
  const wasIdle = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(idle ? idle.split(' ') : []);
    const wentIdle = [...now].some((id) => !wasIdle.current.has(id));
    wasIdle.current = now;
    if (enabled && wentIdle) void deliver.current();
  }, [enabled, idle]);
}
