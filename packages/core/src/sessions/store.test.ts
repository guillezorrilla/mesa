import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { newSession, sequentialIds, tempDir, thrown } from '../testing.js';
import { sessionStore } from './store.js';

const storeIn = (dir = join(tempDir(), 'sessions')) => ({
  dir,
  store: sessionStore({ dir, newId: sequentialIds() }),
});

test('create, get, update, list, and remove one record per file', () => {
  const { dir, store } = storeIn();
  const created = store.create(() =>
    newSession({ project: 'lantern-cove', startedAt: '2026-09-24T12:00:00.000Z' }),
  );
  expect(created).toMatchObject({ id: '00000001', project: 'lantern-cove', events: [] });
  expect(JSON.parse(readFileSync(join(dir, '00000001.json'), 'utf8'))).toEqual(created);
  expect(store.get('00000001')).toEqual(created);

  const updated = store.update('00000001', { agentSessionId: 'a1b2', lastOutput: '> ready' });
  expect(updated).toEqual({ ...created, agentSessionId: 'a1b2', lastOutput: '> ready' });
  expect(store.get('00000001')).toEqual(updated);
  // The atomic write leaves no temp file behind.
  expect(readdirSync(dir)).toEqual(['00000001.json']);

  store.remove('00000001');
  expect(store.list()).toEqual([]);
  expect(thrown(() => store.get('00000001'))).toEqual({
    code: 'not_found',
    message: 'no session 00000001',
  });
});

test('list is oldest first and leaves ended sessions to all', () => {
  const { store } = storeIn();
  store.create(() => newSession({ project: 'tide', startedAt: '2026-09-24T12:05:00.000Z' }));
  store.create(() =>
    newSession({ project: 'lantern-cove', startedAt: '2026-09-24T12:00:00.000Z' }),
  );
  const ended = store.create(() =>
    newSession({ project: 'harbor', startedAt: '2026-09-24T11:00:00.000Z' }),
  );
  store.update(ended.id, { endedAt: '2026-09-24T11:30:00.000Z' });
  expect(store.list().map((r) => r.project)).toEqual(['lantern-cove', 'tide']);
  expect(store.list({ all: true }).map((r) => r.project)).toEqual([
    'harbor',
    'lantern-cove',
    'tide',
  ]);
});

test('ids never become paths, and a bad record names its file', () => {
  const { dir, store } = storeIn();
  expect(store.list()).toEqual([]); // no sessions/ yet
  for (const id of ['../config', '00000001.json', 'ABCDEFGH']) {
    expect(thrown(() => store.get(id)).code).toBe('not_found');
  }
  store.create(() => newSession({ project: 'tide', startedAt: '2026-09-24T12:00:00.000Z' }));
  // The hooks' events/ folder and a stray file sit beside the records.
  mkdirSync(join(dir, 'events'));
  writeFileSync(join(dir, 'notes.txt'), 'x');
  expect(store.list()).toHaveLength(1);

  expect(thrown(() => store.update('00000001', { startedAt: 'yesterday' })).message).toBe(
    `${dir}/00000001.json: startedAt: Invalid ISO datetime`,
  );
  // A record copied under another name would make update() write to the wrong file.
  writeFileSync(join(dir, 'yyyyyyyy.json'), readFileSync(join(dir, '00000001.json')));
  expect(thrown(() => store.get('yyyyyyyy')).message).toBe(`${dir}/yyyyyyyy.json: id is 00000001`);
  rmSync(join(dir, 'yyyyyyyy.json'));
  writeFileSync(join(dir, 'zzzzzzzz.json'), '{');
  expect(thrown(() => store.list())).toEqual({
    code: 'invalid_config',
    message: `${dir}/zzzzzzzz.json: not valid JSON`,
  });
});
