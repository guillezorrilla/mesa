import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { MesaError } from './result.js';

// Lock files: taken with an exclusive create, holding the holder's token, removed only by it.

/** Takes the lock file at `path` for `token` with an exclusive create; false while another holds it. */
export function tryLock(path: string, token: string): boolean {
  try {
    writeFileSync(path, token, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4));

/**
 * Runs `fn` holding the lock file `lock`, waiting synchronously for another holder: `tries`
 * pauses of 5 ms (about 2 s by default), then `busy()` is thrown.
 * ponytail: blocks the event loop while it waits; the sections it guards are one read and one
 * rename, so waits are short. No stale takeover, as for the vault lock.
 */
export function withLockSync<T>(lock: string, fn: () => T, busy: () => MesaError, tries = 400): T {
  const token = randomUUID();
  for (let attempt = 0; !tryLock(lock, token); attempt++) {
    if (attempt >= tries) throw busy();
    Atomics.wait(PAUSE, 0, 0, 5);
  }
  try {
    return fn();
  } finally {
    unlock(lock, token);
  }
}

/** Removes the lock file, only while it still holds `token`. */
export function unlock(path: string, token: string): void {
  const holder = (() => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  })();
  if (holder === token) rmSync(path, { force: true });
}
