import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { RunResult } from '../lib/process.js';
import { movableClock, scriptedRunner, tempDir } from '../testing/index.js';
import { FETCH_REUSE_MS, fetchBase } from './fetch.js';

/** git with an `origin` remote, whose fetch answers `fetched`; every call recorded. */
function world(fetched: RunResult = { ok: true, stdout: '' }) {
  const { run, calls } = scriptedRunner({
    git: (args) => (args[2] === 'remote' ? 'origin\nupstream\n' : fetched),
  });
  const fetches = () => calls.filter((c) => c.args[2] === 'fetch').map((c) => c.args.slice(2));
  return { run, fetches, stamps: join(tempDir(), 'sessions', 'fetches.json') };
}

test("a new branch fetches only its base from the base's remote", async () => {
  const { run, fetches, stamps } = world();
  const { clock } = movableClock();
  expect(await fetchBase(run, clock, stamps, '/r/tide', 'upstream/release/2')).toBeUndefined();
  expect(fetches()).toEqual([['fetch', '--end-of-options', 'upstream', 'release/2']]);
});

test('a fetch under 30 s old is reused, and an older one fetched again', async () => {
  const { run, fetches, stamps } = world();
  const time = movableClock();
  await fetchBase(run, time.clock, stamps, '/r/tide', 'origin/main');
  time.pass(FETCH_REUSE_MS - 1);
  await fetchBase(run, time.clock, stamps, '/r/tide', 'origin/main');
  expect(fetches()).toHaveLength(1);
  // Another repository, or another base, is its own fetch.
  await fetchBase(run, time.clock, stamps, '/r/reef', 'origin/main');
  await fetchBase(run, time.clock, stamps, '/r/tide', 'origin/develop');
  expect(fetches()).toHaveLength(3);
  time.pass(1);
  await fetchBase(run, time.clock, stamps, '/r/tide', 'origin/main');
  expect(fetches()).toHaveLength(4);
});

test('a base on no remote is not fetched', async () => {
  const { run, fetches, stamps } = world();
  await fetchBase(run, movableClock().clock, stamps, '/r/tide', 'main');
  expect(fetches()).toEqual([]);
});

test('a failed fetch is a warning, stamps nothing, and the next start fetches again', async () => {
  const { run, fetches, stamps } = world({ ok: false, reason: 'failed', detail: 'offline' });
  const { clock } = movableClock();
  expect(await fetchBase(run, clock, stamps, '/r/tide', 'origin/main')).toBe(
    'cannot fetch origin/main: offline; started from the local origin/main',
  );
  await fetchBase(run, clock, stamps, '/r/tide', 'origin/main');
  expect(fetches()).toHaveLength(2);
});
