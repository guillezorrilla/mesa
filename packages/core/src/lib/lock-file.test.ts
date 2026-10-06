import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lockDeps, tempDir } from '../testing/index.js';
import { lockedBy, withLock, withLockSync } from './lock-file.js';

const DEAD = 101;
const deadToken = '00000000-0000-4000-8000-000000000101';
const busy = (lock: string) => () => lockedBy('the test file', lock, 'test');

/** A lock file another process holds: pid 101, which `alive` decides is running or not. */
function heldLock() {
  const lock = join(tempDir(), 'state.lock');
  const record = JSON.stringify({
    pid: DEAD,
    startedAt: '2026-09-24T11:00:00.000Z',
    token: deadToken,
  });
  writeFileSync(lock, record);
  return { lock, record };
}
const holder = (lock: string) => JSON.parse(readFileSync(lock, 'utf8'));

test('a live holder blocks: the lock is busy and its file stays', () => {
  const { lock, record } = heldLock();
  const error = (() => {
    try {
      return withLockSync(lockDeps(), lock, () => 'ran', busy(lock), 2);
    } catch (thrown) {
      return thrown;
    }
  })();
  expect(error).toMatchObject({ code: 'locked', details: { reason: 'test' } });
  expect(readFileSync(lock, 'utf8')).toBe(record);
});

test('a dead holder is taken over: the lock records this holder, then is removed', async () => {
  const alive = (pid: number) => pid !== DEAD;
  const { lock } = heldLock();
  const seen = withLockSync(lockDeps(alive), lock, () => holder(lock), busy(lock));
  expect(seen).toMatchObject({ pid: 4242, startedAt: '2026-09-24T12:00:00.000Z' });
  expect(seen.token).not.toBe(deadToken);
  expect(() => readFileSync(lock)).toThrow();

  heldLock();
  const deps = { ...lockDeps(alive), sleep: async () => {} };
  expect(await withLock(deps, lock, async () => holder(lock).pid, busy(lock))).toBe(4242);
  expect(() => readFileSync(lock)).toThrow();
});

test('two contenders taking over a dead lock leave exactly one owner', async () => {
  const { lock } = heldLock();
  const inside: string[] = [];
  let release = () => {};
  let first: Promise<void> | undefined;
  // The second contender reads the dead holder; while it asks whether that holder is alive, the
  // first takes the lock over and holds it until the second has waited once.
  const second = lockDeps((pid) => {
    first ??= withLock(
      { ...lockDeps((p) => p !== DEAD), sleep: async () => {} },
      lock,
      async () => {
        inside.push('first in');
        await new Promise<void>((done) => {
          release = done;
        });
        inside.push('first out');
      },
      busy(lock),
    );
    return pid !== DEAD;
  });
  const waits = { ...second, sleep: async () => release() };
  await withLock(waits, lock, async () => void inside.push('second in'), busy(lock));
  await first;
  expect(inside).toEqual(['first in', 'first out', 'second in']);
  expect(() => readFileSync(lock)).toThrow();
});
