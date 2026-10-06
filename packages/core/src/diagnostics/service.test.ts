import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import { profilePaths } from '../profile/paths.js';
import { eventsLog } from '../sessions/signals/hook-events.js';
import {
  lockDeps,
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';

test('Doctor diagnostics filter and bound profile-local metadata without provider content', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const record = testStore(home).create(() => newSession());
  const paths = profilePaths(home, 'default');
  setConfigValue(paths.config, 'keys.alpha', 'secretpass', lockDeps());
  const file = eventsLog(paths.events, record.id);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    [
      { at: '2026-09-24T12:00:00.000Z', agent: 'claude', event: 'Stop', payload: {} },
      {
        at: '2026-09-24T12:01:00.000Z',
        agent: 'claude',
        event: 'Permission-secretpass',
        payload: { tool_input: 'private provider content' },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n'),
  );
  const latest = mesa.diagnostics.list({ event: 'permission', limit: 1 });
  expect(latest).toMatchObject({ total: 1, limit: 1 });
  expect(latest.events).toMatchObject([{ session: record.id, event: 'Permission-***' }]);
  expect(JSON.stringify(latest)).not.toMatch(/secretpass|private provider content/);
  expect(mesa.diagnostics.list({ limit: 1 })).toMatchObject({
    total: 2,
    events: [latest.events[0]],
  });
  expect(createMesa('other', testDeps(home)).diagnostics.list().events).toEqual([]);
  expect(() => mesa.diagnostics.list({ limit: 201 })).toThrow('1-200');
});
