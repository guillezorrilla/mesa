import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import {
  multiProjectSession,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
  thrown,
} from '../testing/index.js';
import { recordScope } from './record-scope.js';

test('a session is in scope for each of its projects, an additional one too, and the Caller defaults on any', () => {
  const { home, mesa } = projectProfile(scriptedRunner().run);
  for (const name of ['tide-pool', 'driftwood']) {
    mkdirSync(join(home, 'src', name));
    mesa.projects.register(join(home, 'src', name), true);
  }
  const across = testStore(home).create(() => multiProjectSession());
  const ctx = createContext('default', testDeps(home));
  expect(recordScope(ctx, { project: 'tide-pool', session: across.id })).toMatchObject({
    project: 'tide-pool',
    session: { id: across.id },
  });
  expect(thrown(() => recordScope(ctx, { project: 'driftwood', session: across.id }))).toEqual({
    code: 'usage',
    message: `session ${across.id} is on lantern-cove, tide-pool, not driftwood`,
  });
  const inWindow = createContext(
    'default',
    testDeps(home, { env: { MESA_SESSION_ID: across.id } }),
  );
  expect(recordScope(inWindow, { project: 'tide-pool' }).session?.id).toBe(across.id);
  expect(recordScope(inWindow, { project: 'driftwood' }).session).toBeUndefined();
});
