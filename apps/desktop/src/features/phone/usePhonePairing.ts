import type { PairStart } from '@mesa/core';
import { useEffect, useState } from 'react';
import { warningOf } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** How often a shown code asks whether the phone scanned it. */
export const PAIRING_POLL_MS = 2_000;

export type PairingCode = PairStart & { svg: string };

/**
 * The profile's phone pairing: its status, the code on show while no phone has scanned it (asked
 * about every PAIRING_POLL_MS, and put away once it expires), and the pair and unpair actions.
 */
export function usePhonePairing() {
  const status = useCommand('phone.status');
  const run = useRun();
  const { acting, act } = useAct();
  const [shown, setShown] = useState<PairingCode>();
  const paired = status.data?.paired === true;
  const code = paired ? undefined : shown;

  useEffect(() => {
    if (!code) return;
    const expiresAt = Date.parse(code.expiresAt);
    const timer = window.setInterval(() => {
      if (Date.now() >= expiresAt) setShown(undefined);
      else void status.refresh();
    }, PAIRING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [code, status.refresh]);

  const pair = () =>
    void act(async () => {
      const result = await run('phone.pair');
      if (result) setShown(result);
      await status.refresh();
      return result && warningOf(result);
    });
  const unpair = () =>
    void act(async () => {
      const result = await run('phone.unpair');
      setShown(undefined);
      await status.refresh();
      return result && warningOf(result);
    });

  return { status: status.data, code, acting, pair, unpair };
}
