import type { Result, VaultInventory, VaultStatus } from '@mesa/core';
import { useEffect, useRef, useState } from 'react';
import { useCall } from '@/lib/useCommand';

/** The Vault screen looks at the vault again this often while it shows. */
const LOOK_MS = 5_000;

/**
 * One look: the inventory, or why it did not list, the layout's status when it read, and how many
 * looks there have been, this one included.
 */
export type VaultLook = { list: Result<VaultInventory>; status?: VaultStatus; count: number };

/**
 * The profile vault as `mesa vault list` and `mesa vault status` see it, looked at on mount, every
 * five seconds, and whenever the window gains focus, so notes changed outside Mesa show. One look
 * at a time: a tick or a focus while one runs is skipped. A list that fails is kept, for the screen
 * to explain, not toasted. A look belongs to the bridge, and so the profile, that made it: another
 * bridge's screen shows none until its own lands, and a reply for the one before never shows.
 */
export function useVaultLook(): VaultLook | undefined {
  const call = useCall();
  const [look, setLook] = useState<VaultLook & { call: typeof call }>();
  useEffect(() => {
    let active = true;
    let running = false;
    const again = async () => {
      if (running) return;
      running = true;
      const [list, status] = await Promise.all([call('vault.list'), call('vault.status')]);
      running = false;
      if (!active) return;
      setLook((last) => ({
        call,
        list,
        status: status.ok ? status.data : undefined,
        count: (last?.count ?? 0) + 1,
      }));
    };
    const lookAgain = () => void again();
    lookAgain();
    const timer = setInterval(lookAgain, LOOK_MS);
    window.addEventListener('focus', lookAgain);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', lookAgain);
    };
  }, [call]);
  return look?.call === call ? look : undefined;
}

/** Refresh a reader or search after the next look, keeping its last result while it runs. */
export function useVaultRefresh(looks: number, busy: boolean, refresh: () => Promise<void>) {
  const seen = useRef(looks);
  useEffect(() => {
    if (seen.current === looks || busy) return;
    seen.current = looks;
    void refresh();
  }, [looks, busy, refresh]);
}
