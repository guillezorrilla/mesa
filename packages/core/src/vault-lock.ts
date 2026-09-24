import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MesaError } from './result.js';

/** About five seconds of retries before giving up. */
export const LOCK_ATTEMPTS = 250;
const RETRY_MS = 20;

export const vaultLockPath = (vault: string) => join(vault, '.mesa', 'lock');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` while holding the vault's lock file, taken with an exclusive create, so
 * read-modify-write updates of shared notes serialise across processes. The file holds this
 * holder's token and is removed only while it still does.
 * ponytail: no stale takeover (it races); a lock left by a killed process is reported with the
 * file to delete. Upgrade path: flock through a native helper if that ever bites.
 */
export async function withVaultLock<T>(vault: string, fn: () => Promise<T>): Promise<T> {
  const lock = vaultLockPath(vault);
  const token = randomUUID();
  mkdirSync(join(vault, '.mesa'), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(lock, token, { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt >= LOCK_ATTEMPTS) {
        throw new MesaError(
          'locked',
          `the vault is locked by another mesa process (${lock}); retry, or delete that file if no mesa is running`,
          { reason: 'vault' },
        );
      }
      await sleep(RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    const holder = (() => {
      try {
        return readFileSync(lock, 'utf8');
      } catch {
        return undefined;
      }
    })();
    if (holder === token) rmSync(lock, { force: true });
  }
}
