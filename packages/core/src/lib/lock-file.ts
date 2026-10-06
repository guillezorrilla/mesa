import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { createFileAtomic, writeFileAtomic } from './atomic-file.js';
import type { Clock } from './clock.js';
import { MesaError } from './result.js';

// Lock files (ADR-0022): created whole with the holder's {pid, startedAt, token}, removed only by
// that holder, and taken over once the holder's process is gone.

/** What a lock needs from the outside: this process, whether another is alive, and the time. */
export type LockDeps = {
  processId: number;
  processAlive: (pid: number) => boolean;
  clock: Clock;
};

/** LockDeps for an async lock (withLock), which waits with `sleep`. */
export type AsyncLockDeps = LockDeps & { sleep: (ms: number) => Promise<void> };

const HolderSchema = z.strictObject({
  pid: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  token: z.uuid(),
});
type Holder = z.infer<typeof HolderSchema>;

/**
 * The error for a lock another mesa holds: `what` is locked, with the file to delete should no
 * mesa be running, and `reason` saying which lock it was.
 */
export const lockedBy = (what: string, lock: string, reason: string) =>
  new MesaError(
    'locked',
    `${what} is locked by another mesa process (${lock}); retry, or delete that file if no mesa is running`,
    { reason },
  );

/** The holder `path` names: undefined when it is gone or not a holder record (an older mesa's). */
function holderOf(path: string): Holder | undefined {
  try {
    return HolderSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/**
 * Takes the lock file at `path` for `token`: with an exclusive create, or, when its holder's
 * process is dead, by renaming this holder's record over it. Only the contender that creates the
 * claim file `<path>.<dead token>` may replace that holder, and it checks again under the claim,
 * so two contenders leave one owner. False while a live holder has it.
 * ponytail: a contender killed while it holds a claim (held for one read and one rename) leaves
 * that dead lock to be deleted by hand, as every lock was before takeover.
 */
function take(path: string, token: string, deps: LockDeps): boolean {
  const mine = JSON.stringify({
    pid: deps.processId,
    startedAt: deps.clock().toISOString(),
    token,
  } satisfies Holder);
  if (createFileAtomic(path, mine)) return true;
  const held = holderOf(path);
  if (!held || deps.processAlive(held.pid)) return false;
  const claim = `${path}.${held.token}`;
  if (!createFileAtomic(claim, mine)) return false;
  try {
    if (holderOf(path)?.token !== held.token) return false;
    writeFileAtomic(path, mine);
    return true;
  } finally {
    rmSync(claim, { force: true });
  }
}

/** Removes the lock file, only while it still holds `token`. */
function unlock(path: string, token: string): void {
  if (holderOf(path)?.token === token) rmSync(path, { force: true });
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4));

/**
 * Runs `fn` holding the lock file `lock`, waiting synchronously for a live holder: `tries` pauses
 * of 5 ms (about 2 s by default), then `busy()` is thrown.
 * ponytail: blocks the event loop while it waits; the sections it guards are one read and one
 * rename, so waits are short.
 */
export function withLockSync<T>(
  deps: LockDeps,
  lock: string,
  fn: () => T,
  busy: () => MesaError,
  tries = 400,
): T {
  const token = randomUUID();
  for (let attempt = 0; !take(lock, token, deps); attempt++) {
    if (attempt >= tries) throw busy();
    Atomics.wait(PAUSE, 0, 0, 5);
  }
  try {
    return fn();
  } finally {
    unlock(lock, token);
  }
}

/**
 * Runs `fn` holding `<file>.lock`, the lock a read-change-write of `file` takes, named `what` in
 * the error a held one gives.
 */
export function withFileLock<T>(
  deps: LockDeps,
  file: string,
  fn: () => T,
  what = basename(file),
  tries?: number,
): T {
  const lock = `${file}.lock`;
  return withLockSync(deps, lock, fn, () => lockedBy(what, lock, what), tries);
}

/** withLockSync for async work: waits with `deps.sleep`, `tries` pauses of `pauseMs`. */
export async function withLock<T>(
  deps: AsyncLockDeps,
  lock: string,
  fn: () => Promise<T>,
  busy: () => MesaError,
  tries = 400,
  pauseMs = 5,
): Promise<T> {
  const token = randomUUID();
  for (let attempt = 0; !take(lock, token, deps); attempt++) {
    if (attempt >= tries) throw busy();
    await deps.sleep(pauseMs);
  }
  try {
    return await fn();
  } finally {
    unlock(lock, token);
  }
}
