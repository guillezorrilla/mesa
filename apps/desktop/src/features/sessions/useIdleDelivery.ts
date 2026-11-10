import type { TreeRow } from '@mesa/core';
import { useEffect, useRef } from 'react';
import { useCall } from '@/lib/useCommand';

/** How often the app types Mesa's news into idle sessions while nothing else asks it to. */
export const IDLE_DELIVERY_INTERVAL_MS = 60_000;

/** The passes that type Mesa's own news into idle sessions: PR events and child reports. */
export type IdleDeliveryCommand = 'prEvents.deliver' | 'reports.deliver';

/**
 * Runs each of `commands` (those the profile turned on) on an interval and whenever a session
 * goes idle, one pass at a time. Core decides which sessions take what; a failed pass is quiet,
 * and the next one tries again.
 */
export function useIdleDelivery(
  commands: readonly IdleDeliveryCommand[],
  sessions: readonly TreeRow[],
) {
  const call = useCall();
  const busy = useRef(false);
  const deliver = useRef(async () => {});
  deliver.current = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (const command of commands) await call(command).catch(() => undefined);
    } finally {
      busy.current = false;
    }
  };
  const enabled = commands.join(' ');
  useEffect(() => {
    if (!enabled) return;
    void deliver.current();
    const timer = window.setInterval(() => void deliver.current(), IDLE_DELIVERY_INTERVAL_MS);
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
