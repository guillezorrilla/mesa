import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tryLock, unlock } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { VAULT } from './layout.js';

/** About five seconds of retries before giving up. */
const LOCK_ATTEMPTS = 250;
const RETRY_MS = 20;

export const vaultLockPath = (vault: string) => join(vault, VAULT.mesa, 'lock');

/**
 * Runs `fn` while holding the vault's lock file, taken with an exclusive create, so
 * read-modify-write updates of shared notes serialise across processes. The file holds this
 * holder's token and is removed only while it still does.
 * ponytail: no stale takeover (it races); a lock left by a killed process is reported with the
 * file to delete. Upgrade path: flock through a native helper if that ever bites.
 */
export async function withVaultLock<T>(
  deps: { vault: string; sleep: (ms: number) => Promise<void> },
  fn: () => Promise<T>,
): Promise<T> {
  const { vault } = deps;
  const lock = vaultLockPath(vault);
  const token = randomUUID();
  mkdirSync(join(vault, VAULT.mesa), { recursive: true });
  for (let attempt = 0; !tryLock(lock, token); attempt++) {
    if (attempt >= LOCK_ATTEMPTS) {
      throw new MesaError(
        'locked',
        `the vault is locked by another mesa process (${lock}); retry, or delete that file if no mesa is running`,
        { reason: 'vault' },
      );
    }
    await deps.sleep(RETRY_MS);
  }
  try {
    return await fn();
  } finally {
    unlock(lock, token);
  }
}
