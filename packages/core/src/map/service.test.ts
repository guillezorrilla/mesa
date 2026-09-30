import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import {
  newSession,
  projectProfile,
  scriptedRunner,
  shortIds,
  tempDir,
  testDeps,
  testStore,
} from '../testing/index.js';

// Cross the same Mesa interface as the CLI; its clock, store, vault and runner are controlled.
const setup = () => {
  const runner = scriptedRunner();
  const profile = projectProfile(runner.run);
  const store = testStore(profile.home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  store.create(() => newSession({ name: 'Chart shoals' }));
  store.create(() => newSession({ startedAt: '2026-01-01T00:00:00.000Z' }));
  return { ...profile, runner, vault: join(profile.home, 'vault') };
};

test('saved map updates without history and repeated updates preserve exact bytes and mtime', async () => {
  const { mesa, vault, runner } = setup();
  const log = readFileSync(join(vault, 'log.md'));
  const index = readFileSync(join(vault, 'index.md'));
  expect(await mesa.map()).toEqual({
    path: 'map.canvas',
    changed: true,
    groups: 1,
    nodes: 3,
    edges: 0,
  });
  const file = join(vault, 'map.canvas');
  const bytes = readFileSync(file);
  utimesSync(file, new Date(0), new Date(0));
  expect(await mesa.map()).toMatchObject({ changed: false, nodes: 3 });
  expect(statSync(file).mtimeMs).toBe(0);
  expect(readFileSync(file)).toEqual(bytes);
  const read = mesa.vault.read('map.canvas');
  expect(read).toMatchObject({
    preview: 'canvas',
    nodes: 3,
    edges: 0,
    canvas: { nodes: expect.any(Array) },
  });
  expect(readFileSync(join(vault, 'log.md'))).toEqual(log);
  expect(readFileSync(join(vault, 'index.md'))).toEqual(index);
  expect(mesa.receipts.list({})).toEqual([]);
  expect(runner.calls).toEqual([]);
  expect(await mesa.map({ all: true })).toMatchObject({ changed: true, nodes: 4 });
});

test('adding and removing the exact summary changes the persisted node type', async () => {
  const { mesa, vault } = setup();
  await mesa.map();
  mkdirSync(join(vault, 'wiki/sessions'), { recursive: true });
  const summary = join(vault, 'wiki/sessions/aaaaaaaa.md');
  writeFileSync(summary, '# Chart shoals\n');
  expect(await mesa.map()).toMatchObject({ changed: true });
  expect(readFileSync(join(vault, 'map.canvas'), 'utf8')).toContain(
    '"file": "wiki/sessions/aaaaaaaa.md"',
  );
  rmSync(summary);
  expect(await mesa.map()).toMatchObject({ changed: true });
  expect(readFileSync(join(vault, 'map.canvas'), 'utf8')).not.toContain('"type": "file"');
});

test('missing and uninitialized vaults and escaping destinations refuse before mutation', async () => {
  const { mesa, vault } = setup();
  const outside = join(tempDir(), 'untouched.canvas');
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(vault, 'map.canvas'));
  expect(existsSync(join(vault, '.mesa'))).toBe(false);
  await expect(mesa.map()).rejects.toMatchObject({ code: 'usage' });
  expect(readFileSync(outside, 'utf8')).toBe('outside');
  expect(existsSync(join(vault, '.mesa'))).toBe(false);
  rmSync(vault, { recursive: true });
  await expect(mesa.map()).rejects.toMatchObject({ code: 'not_found' });
  expect(existsSync(vault)).toBe(false);
  mkdirSync(vault);
  await expect(mesa.map()).rejects.toMatchObject({ code: 'not_found' });
  expect(existsSync(join(vault, '.mesa'))).toBe(false);
});

test('a map includes only saved records from the active profile', async () => {
  const { home, mesa } = setup();
  const other = createMesa('other', testDeps(home));
  other.init({ vault: 'other-vault' });
  other.vault.init();
  expect(await other.map({ all: true })).toEqual({
    path: 'map.canvas',
    changed: true,
    groups: 0,
    nodes: 1,
    edges: 0,
  });
  expect(await mesa.map()).toMatchObject({ groups: 1, nodes: 3 });
});

test('the public writer derives its inclusive elapsed window once from the injected clock', async () => {
  let calls = 0;
  const { home, mesa } = projectProfile(scriptedRunner().run, {
    clock: () => {
      calls += 1;
      return new Date('2026-02-01T12:00:00.000Z');
    },
  });
  const store = testStore(home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb', 'cccccccc'));
  store.create(() => newSession({ startedAt: '2026-01-02T12:00:00.000Z' }));
  store.create(() => newSession({ startedAt: '2026-01-02T11:59:59.999Z' }));
  store.create(() => newSession({ startedAt: '2026-02-01T12:00:00.001Z' }));
  calls = 0;
  expect(await mesa.map()).toMatchObject({ nodes: 3, groups: 1 });
  expect(calls).toBe(1);
  expect(readFileSync(join(home, 'vault/map.canvas'), 'utf8')).toContain(
    'session:lantern-cove:aaaaaaaa',
  );
});
