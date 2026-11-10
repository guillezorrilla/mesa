import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lockDeps, newSession, sequentialIds, tempDir } from '../../testing/index.js';
import { setProgress } from './edits.js';
import { sessionStore } from './store.js';

const AT = '2026-09-24T12:00:00.000Z';

test('a progress line is kept cleaned and cut to 120 characters, then cleared', () => {
  const store = sessionStore({
    dir: join(tempDir(), 'sessions'),
    newId: sequentialIds(),
    lock: lockDeps(),
  });
  const { id } = store.create(() => newSession({ project: 'lantern-cove' }));
  setProgress(store, id, '  Running the\ntide-table‮ tests\u001b[2J ', AT);
  expect(store.get(id).progress).toEqual({ text: 'Running the tide-table tests [2J', at: AT });
  setProgress(store, id, 'x'.repeat(200), AT);
  expect(store.get(id).progress?.text).toHaveLength(120);
  expect(() => setProgress(store, id, '​', AT)).toThrow('empty');
  setProgress(store, id, undefined, AT);
  expect(store.get(id).progress).toBeUndefined();
});
