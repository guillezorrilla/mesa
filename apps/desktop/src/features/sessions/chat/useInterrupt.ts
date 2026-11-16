import type { TreeRow } from '@mesa/core';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useCall } from '@/lib/useCommand';

/** How long Stopping holds before Stop can be pressed again, for a turn that does not end. */
const STOP_HOLD_MS = 10_000;

/**
 * Stop for a Structured session's chat (#1222): `working` while its agent is mid-turn, `stop`
 * interrupts it through its host, and `stopping` holds from the press until the turn ends or the
 * host refuses (toasted), so a second press cannot cut the next turn.
 */
export function useInterrupt(row?: TreeRow) {
  const call = useCall();
  const toast = useToast();
  const working = Boolean(
    row?.managed && row.view === 'structured' && row.lastState.state === 'working',
  );
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!working) setStopping(false);
  }, [working]);
  // A stop the host took whose turn has not ended yet: Stop again after a while.
  useEffect(() => {
    if (!stopping) return;
    const timer = window.setTimeout(() => setStopping(false), STOP_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stopping]);
  const stop = async () => {
    if (!row || stopping) return;
    setStopping(true);
    const done = await call('sessions.interrupt', { id: row.id });
    if (!done.ok) {
      setStopping(false);
      toast(done.error.message, 'alert');
    }
  };
  return { working, stopping, stop };
}
