import { startTransition, useState } from 'react';
import { useMac } from '../mac/useMac';
import { useVaultRead, type VaultRead } from './useVaultRead';

/**
 * The Vault tab's data: the Mac's projects, read once, and a Vault search, asked when the person
 * submits words and dropped when they cancel or empty the box.
 */
export function useVault() {
  const link = useMac();
  const projects = useVaultRead({ method: 'projects' });
  const [search, setSearch] = useState<Promise<VaultRead<'search'>>>();
  const find = (text: string) => {
    const words = text.trim();
    // The promise is made here, not in an updater, which React may run again while it suspends.
    const next = words
      ? link.call({ method: 'search', text: words }).then(
          (result) => ({ result }),
          (error: Error) => ({ error: error.message }),
        )
      : undefined;
    startTransition(() => setSearch(next));
  };
  return { projects, search, find, clear: () => setSearch(undefined) };
}
