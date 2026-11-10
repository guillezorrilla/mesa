import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FRESH_MS } from '../sessions/signals/state.js';
import { listingDeps, SPIKE_LISTING, scriptedRunner, tempDir } from '../testing/index.js';
import { keptListing } from './kept-listing.js';

test('a kept listing serves its agents only while young; a foreign row stays meanwhile', async () => {
  const { run, calls } = scriptedRunner({ claude: JSON.stringify([SPIKE_LISTING.idle]) });
  let now = '2026-09-24T12:00:00.000Z';
  const deps = listingDeps(run, { clock: () => new Date(now) });
  const listing = keptListing({
    ...deps,
    file: join(tempDir(), 'listing.json'),
    maxAgeMs: FRESH_MS,
  });
  const first = await listing([]);
  expect(first).toHaveLength(1);
  // Reused: the same foreign process, no new run.
  now = '2026-09-24T12:00:59.000Z';
  expect(await listing(['claude'])).toEqual(first);
  expect(calls.filter((c) => c.file === 'claude')).toHaveLength(1);
  // Too old to reuse: listed again.
  now = '2026-09-24T12:01:00.000Z';
  await listing(['claude']);
  expect(calls.filter((c) => c.file === 'claude')).toHaveLength(2);
});

test('a kept listing that cannot be written still lists', async () => {
  const { run } = scriptedRunner({ claude: JSON.stringify([SPIKE_LISTING.idle]) });
  // A file where its folder should be: the write fails, the look does not.
  const file = join(tempDir(), 'listing.json', 'nested');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(file, '..'), 'not a folder');
  const listing = keptListing({ ...listingDeps(run), file, maxAgeMs: FRESH_MS });
  expect(await listing([])).toHaveLength(1);
});
