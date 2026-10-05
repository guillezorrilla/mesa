import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import {
  multiProjectSession,
  newSession,
  profilePaths,
  tempDir,
  testDeps,
  testStore,
  thrown,
} from '../testing/index.js';

test('project sorting uses durable visits and session history, preserves pins and ties, and leaves project data intact', () => {
  const home = tempDir();
  let now = '2026-09-24T12:00:00.000Z';
  const deps = testDeps(home, { clock: () => new Date(now) });
  const mesa = createMesa('default', deps);
  mesa.init({ vault: 'vault' });
  for (const name of ['lantern', 'tide', 'cove', 'empty']) {
    const dir = join(home, name);
    mkdirSync(dir);
    mesa.projects.register(dir, true);
  }
  const names = (mode: string) => mesa.projects.list(mode).map((row) => row.name);
  expect(names('recent')).toEqual(['lantern', 'tide', 'cove', 'empty']);
  expect(names('name')).toEqual(['cove', 'empty', 'lantern', 'tide']);
  const yaml = readFileSync(join(home, 'lantern/mesa.yaml'), 'utf8');
  mesa.projects.visit('lantern');
  mesa.projects.visit('lantern');
  now = '2026-09-25T12:00:00.000Z';
  mesa.projects.visit('tide');
  expect(names('recent')).toEqual(['tide', 'lantern', 'cove', 'empty']);
  expect(names('most-visited')).toEqual(['lantern', 'tide', 'cove', 'empty']);
  const store = testStore(home);
  store.create(() => newSession({ project: 'lantern', startedAt: '2026-09-24T12:00:00.000Z' }));
  store.create(() => newSession({ project: 'tide', startedAt: '2026-09-23T12:00:00.000Z' }));
  store.create(() => newSession({ project: 'tide', startedAt: '2026-09-24T12:00:00.000Z' }));
  store.create(() =>
    newSession({
      project: 'cove',
      startedAt: '2026-09-26T12:00:00.000Z',
      endedAt: '2026-09-26T13:00:00.000Z',
    }),
  );
  store.create(() => newSession({ project: 'lantern', archivedAt: now }));
  store.create(() => newSession({ project: 'lantern', resumedBy: '12345678' }));
  store.create(() =>
    newSession({
      project: 'lantern',
      lastState: { state: 'done', confidence: 1, at: now, source: 'mesa' },
    }),
  );
  expect(names('last-session')).toEqual(['cove', 'lantern', 'tide', 'empty']);
  expect(names('active-sessions')).toEqual(['tide', 'lantern', 'cove', 'empty']);
  mesa.projects.update('empty', { pinned: true });
  expect(names('active-sessions')).toEqual(['empty', 'tide', 'lantern', 'cove']);
  mesa.projects.update('tide', { label: 'Abalone' });
  expect(names('name')).toEqual(['empty', 'tide', 'cove', 'lantern']);
  mesa.projects.update('tide', { hidden: true });
  expect(mesa.projects.list('recent').find((row) => row.name === 'tide')?.hidden).toBe(true);
  const reloaded = createMesa('default', deps);
  expect(reloaded.projects.list('most-visited').map((row) => row.name)).toEqual([
    'empty',
    'lantern',
    'tide',
    'cove',
  ]);
  expect(readFileSync(join(home, 'lantern/mesa.yaml'), 'utf8')).toBe(yaml);
  const registry = readFileSync(profilePaths(home, 'default').registry, 'utf8');
  expect(thrown(() => mesa.projects.visit('absent')).code).toBe('not_found');
  expect(readFileSync(profilePaths(home, 'default').registry, 'utf8')).toBe(registry);
  expect(thrown(() => mesa.projects.list('not-a-sort')).code).toBe('usage');
});

test('a session counts for every project it works in, an additional one too', () => {
  const home = tempDir();
  const mesa = createMesa('default', testDeps(home));
  mesa.init({ vault: 'vault' });
  for (const name of ['driftwood', 'lantern-cove', 'tide-pool']) {
    const dir = join(home, name);
    mkdirSync(dir);
    mesa.projects.register(dir, true);
  }
  const store = testStore(home);
  store.create(() =>
    newSession({
      project: 'driftwood',
      startedAt: '2026-09-23T12:00:00.000Z',
      endedAt: '2026-09-23T13:00:00.000Z',
    }),
  );
  store.create(() => multiProjectSession({ startedAt: '2026-09-25T12:00:00.000Z' }));
  const names = (mode: string) => mesa.projects.list(mode).map((row) => row.name);
  expect(names('active-sessions')).toEqual(['lantern-cove', 'tide-pool', 'driftwood']);
  expect(names('last-session')).toEqual(['lantern-cove', 'tide-pool', 'driftwood']);
});
