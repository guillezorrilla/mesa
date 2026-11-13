import type { CallResult } from '@mesa/core/phone';
import { startTransition, useState } from 'react';
import { type MacRead, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useMacRead } from '../mac/useMacRead';

/**
 * The Vault tab's data: the Mac's projects, and a Vault search, asked when the person submits
 * words and dropped when they cancel or empty the box.
 */
export function useVault() {
  const link = useMac();
  const { answer: projects } = useMacRead({ method: 'projects' });
  const [search, setSearch] = useState<Promise<MacRead<CallResult<'vaultSearch'>>>>();
  const find = (text: string) => {
    const words = text.trim();
    // The promise is made here, not in an updater, which React may run again while it suspends.
    const next = words
      ? tryCall(link, () => link.call({ method: 'vaultSearch', text: words }))
      : undefined;
    startTransition(() => setSearch(next));
  };
  return { projects, search, find, clear: () => setSearch(undefined) };
}
