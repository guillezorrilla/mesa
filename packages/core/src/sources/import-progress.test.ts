import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lockDeps, tempDir } from '../testing/index.js';
import { importProgress } from './import-progress.js';

test('a running import shows each step, refuses a second, and is gone once it ends', async () => {
  const dir = join(tempDir(), 'import-progress');
  const progress = importProgress(dir, lockDeps());
  expect(progress.read('lantern-cove')).toBeNull();
  const seen: unknown[] = [];
  const result = await progress.track('lantern-cove', async (step) => {
    seen.push(progress.read('lantern-cove'));
    step({ phase: 'fetching', done: 2, total: 3 });
    seen.push(progress.read('lantern-cove'));
    step({ phase: 'notes', done: 0, total: 3 });
    seen.push(progress.read('lantern-cove'));
    const second = await progress.track('lantern-cove', async () => 'ran').catch((e) => e);
    expect(second.code).toBe('locked');
    // Another project's import is its own.
    expect(await progress.track('reef', async () => 'ran')).toBe('ran');
    return 'imported';
  });
  expect(result).toBe('imported');
  expect(seen).toMatchObject([
    { phase: 'fetching', done: 0, total: 0 },
    { phase: 'fetching', done: 2, total: 3 },
    { phase: 'notes', done: 0, total: 3 },
  ]);
  expect(progress.read('lantern-cove')).toBeNull();
});

test('a failed import leaves no progress, and one whose process died is not running', async () => {
  const dir = join(tempDir(), 'import-progress');
  const progress = importProgress(dir, lockDeps());
  await expect(
    progress.track('lantern-cove', async () => {
      throw new Error('fetch failed');
    }),
  ).rejects.toThrow('fetch failed');
  expect(progress.read('lantern-cove')).toBeNull();

  let alive = true;
  const crashed = importProgress(
    dir,
    lockDeps(() => alive),
  );
  await crashed.track('lantern-cove', async () => {
    alive = false;
    expect(crashed.read('lantern-cove')).toBeNull();
  });
});
