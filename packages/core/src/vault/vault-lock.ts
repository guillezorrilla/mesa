import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type LockDeps, lockedBy, withLock } from '../lib/lock-file.js';
import { VAULT } from './layout.js';

export const vaultLockPath = (vault: string) => join(vault, VAULT.mesa, 'lock');

/**
 * Runs `fn` holding the vault's lock file, so read-modify-write updates of shared notes serialise
 * across processes: about five seconds of waiting, then `locked`.
 */
export async function withVaultLock<T>(
  deps: LockDeps & { vault: string; sleep: (ms: number) => Promise<void> },
  fn: () => Promise<T>,
): Promise<T> {
  const lock = vaultLockPath(deps.vault);
  mkdirSync(join(deps.vault, VAULT.mesa), { recursive: true });
  return withLock(deps, lock, fn, () => lockedBy('the vault', lock, 'vault'), 250, 20);
}
