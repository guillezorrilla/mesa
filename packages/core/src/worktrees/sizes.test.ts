import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { scriptedRunner, tempDir } from '../testing/index.js';
import { duBytes, measureSizes } from './sizes.js';

/** du answering each path's kibibytes, a clock the test moves, and the cache file. */
function setUp(kib: Record<string, number>, opts: { slow?: string[] } = {}) {
  const { run, calls } = scriptedRunner(
    { du: (args) => `${kib[args[1] as string]}\t${args[1]}\n` },
    opts,
  );
  let now = new Date('2026-11-10T12:00:00Z');
  const deps = { run, clock: () => now, processId: 1, processAlive: () => true };
  const file = join(tempDir(), 'worktree-sizes.json');
  const later = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000);
  };
  return { deps, file, calls, later };
}

test('du -sk output reads as bytes; anything else is no size', () => {
  expect(duBytes('5120\t/w/tide\n')).toBe(5_242_880);
  expect(duBytes('')).toBeUndefined();
  expect(duBytes('du: /w/gone: No such file or directory')).toBeUndefined();
});

test('sizes are measured side by side and reused for 10 minutes, or measured again on refresh', async () => {
  const { deps, file, calls, later } = setUp({ '/w/tide': 5120, '/w/harbour': 2 });
  const first = await measureSizes(deps, file, ['/w/tide', '/w/harbour']);
  expect(first.get('/w/tide')).toEqual({
    sizeBytes: 5_242_880,
    sizeAt: '2026-11-10T12:00:00.000Z',
  });
  expect(calls.map((call) => [call.args, call.timeoutMs])).toEqual([
    [['-sk', '/w/tide'], 60_000],
    [['-sk', '/w/harbour'], 60_000],
  ]);
  later(9);
  expect((await measureSizes(deps, file, ['/w/tide'])).get('/w/tide')?.sizeAt).toBe(
    '2026-11-10T12:00:00.000Z',
  );
  expect(calls).toHaveLength(2);
  expect((await measureSizes(deps, file, ['/w/tide'], true)).get('/w/tide')?.sizeAt).toBe(
    '2026-11-10T12:09:00.000Z',
  );
  later(2);
  // Past 10 minutes from its measure, harbour's size is measured again.
  await measureSizes(deps, file, ['/w/tide', '/w/harbour']);
  expect(calls.map((call) => call.args[1])).toEqual([
    '/w/tide',
    '/w/harbour',
    '/w/tide',
    '/w/harbour',
  ]);
});

test('a du that times out or finds no folder gives null, kept 10 minutes like a size', async () => {
  const { deps, file, calls, later } = setUp({}, { slow: ['du'] });
  const big = async (refresh = false) =>
    (await measureSizes(deps, file, ['/w/big'], refresh)).get('/w/big');
  expect(await big()).toEqual({ sizeBytes: null, sizeAt: '2026-11-10T12:00:00.000Z' });
  later(9);
  expect(await big()).toEqual({ sizeBytes: null, sizeAt: '2026-11-10T12:00:00.000Z' });
  expect(calls).toHaveLength(1);
  later(2);
  await big();
  expect(calls).toHaveLength(2);
  await big(true);
  expect(calls).toHaveLength(3);
  const gone = setUp({ '/w/gone': Number.NaN });
  expect(
    (await measureSizes(gone.deps, gone.file, ['/w/gone'])).get('/w/gone')?.sizeBytes,
  ).toBeNull();
  await measureSizes(gone.deps, gone.file, ['/w/gone']);
  expect(gone.calls).toHaveLength(1);
});

test('a cache written before null was kept still reads', async () => {
  const { deps, file, calls } = setUp({});
  writeFileSync(
    file,
    JSON.stringify({ '/w/tide': { bytes: 2048, at: '2026-11-10T11:55:00.000Z' } }),
  );
  expect((await measureSizes(deps, file, ['/w/tide'])).get('/w/tide')?.sizeBytes).toBe(2048);
  expect(calls).toHaveLength(0);
});

test('a cache that does not read is dropped, not an error', async () => {
  const { deps, file } = setUp({ '/w/tide': 1 });
  writeFileSync(file, '{"/w/tide": {"bytes": "lots"}}');
  expect((await measureSizes(deps, file, ['/w/tide'])).get('/w/tide')?.sizeBytes).toBe(1024);
  writeFileSync(file, 'not json');
  expect((await measureSizes(deps, file, ['/w/tide'], true)).get('/w/tide')?.sizeBytes).toBe(1024);
});
