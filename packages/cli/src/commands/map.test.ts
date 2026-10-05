import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newSession, shortIds, testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('map CLI emits exact counts, --all and no-op text and reads the saved structured Canvas', async () => {
  await cli.withProject();
  const store = testStore(cli.home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  store.create(() => newSession({ name: 'Chart shoals' }));
  store.create(() =>
    newSession({ startedAt: '2026-01-01T00:00:00.000Z', kind: 'terminal', agent: 'terminal' }),
  );
  const first = await cli.mesa('map', '--json');
  expect(first.code).toBe(0);
  expect(first.json).toEqual({
    ok: true,
    data: { path: 'map.canvas', changed: true, groups: 1, nodes: 3, edges: 0 },
  });
  const file = join(cli.home, 'vault/map.canvas');
  const bytes = readFileSync(file);
  utimesSync(file, new Date(0), new Date(0));
  expect((await cli.mesa('map')).stdout).toBe('unchanged map.canvas: 1 groups, 3 nodes, 0 edges\n');
  expect(readFileSync(file)).toEqual(bytes);
  expect(statSync(file).mtimeMs).toBe(0);
  const read = (await cli.mesa('vault', 'read', 'map.canvas', '--json')).json.data;
  expect(read).toMatchObject({
    preview: 'canvas',
    nodes: 3,
    edges: 0,
    texts: expect.arrayContaining([expect.stringContaining('Chart shoals')]),
  });
  expect(read.canvas).toEqual(JSON.parse(bytes.toString()));
  expect((await cli.mesa('map', '--all', '--json')).json.data).toEqual({
    path: 'map.canvas',
    changed: true,
    groups: 1,
    nodes: 4,
    edges: 0,
  });
  expect((await cli.mesa('receipts', '--json')).json.data).toEqual([]);
});

test('map refuses an uninitialized vault with the normal JSON error envelope', async () => {
  await cli.mesa('init', '--vault', 'vault');
  // init lays the vault out; a vault folder that is gone is not.
  rmSync(join(cli.home, 'vault'), { recursive: true });
  const out = await cli.mesa('map', '--json');
  expect(out.code).toBe(3);
  expect(out.json).toMatchObject({
    ok: false,
    error: { code: 'not_found', message: expect.stringContaining('run mesa vault init') },
  });
});

test('disposable CLI output is the exact golden saved Canvas rendered by the app', async () => {
  await cli.withProject();
  await cli.mesa(
    'projects',
    'update',
    'lantern-cove',
    '--label',
    'Lantern Cove',
    '--hidden',
    'true',
  );
  const store = testStore(cli.home, 'default', shortIds('bbbbbbbb', 'aaaaaaaa'));
  store.create(() =>
    newSession({ name: 'Chart shoals', goal: 'Use the blue buoy', resumedFrom: 'aaaaaaaa' }),
  );
  store.create(() => newSession({ startedAt: '2026-08-01T12:00:00.000Z' }));
  mkdirSync(join(cli.home, 'vault/wiki/sessions'), { recursive: true });
  writeFileSync(join(cli.home, 'vault/wiki/sessions/aaaaaaaa.md'), '# Old chart\n');
  expect((await cli.mesa('map', '--json')).json.data).toEqual({
    path: 'map.canvas',
    changed: true,
    groups: 1,
    nodes: 4,
    edges: 1,
  });
  const golden = readFileSync(
    new URL('../../../core/src/map/fixtures/map.canvas', import.meta.url),
    'utf8',
  );
  expect(readFileSync(join(cli.home, 'vault/map.canvas'), 'utf8')).toBe(golden);
  expect((await cli.mesa('vault', 'read', 'map.canvas', '--json')).json.data.canvas).toEqual(
    JSON.parse(golden),
  );
});
