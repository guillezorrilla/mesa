import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import {
  multiProjectSession,
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
  thrown,
} from '../testing/index.js';

let home: string;
let mesa: ReturnType<typeof projectProfile>['mesa'];
let sessions: ReturnType<typeof testStore>;
beforeEach(() => {
  ({ home, mesa } = projectProfile(scriptedRunner().run));
  sessions = testStore(home);
});

const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`;

test("a project's earlier sessions, newest first, ended and archived too, each with its summary", () => {
  const ended = sessions.create(() =>
    newSession({ startedAt: at(1), endedAt: at(2), goal: 'Chart the neaps' }),
  );
  const archived = sessions.create(() =>
    newSession({ startedAt: at(3), endedAt: at(3), archivedAt: at(4), agent: 'codex' }),
  );
  const long = sessions.create(() => newSession({ startedAt: at(5), goal: 'x'.repeat(400) }));
  // Not agent sessions of the project: a plain terminal, a skill run, and another project's.
  sessions.create(() =>
    newSession({ startedAt: at(6), kind: 'terminal', agent: 'terminal', goal: undefined }),
  );
  sessions.create(() => newSession({ startedAt: at(7), kind: 'run' }));
  sessions.create(() => newSession({ startedAt: at(8), project: 'driftwood', goal: 'Elsewhere' }));
  mkdirSync(join(home, 'vault/wiki/sessions'), { recursive: true });
  writeFileSync(join(home, `vault/wiki/sessions/${ended.id}.md`), '# Summary\n');

  expect(mesa.vault.goals('lantern-cove')).toEqual([
    {
      id: long.id,
      agent: 'claude',
      started: at(5),
      goal: `${'x'.repeat(297)}...`,
    },
    { id: archived.id, agent: 'codex', started: at(3), ended: at(3) },
    {
      id: ended.id,
      agent: 'claude',
      started: at(1),
      ended: at(2),
      goal: 'Chart the neaps',
      summary: `wiki/sessions/${ended.id}.md`,
    },
  ]);
  expect(mesa.vault.goals('lantern-cove', { limit: 1 }).map((g) => g.id)).toEqual([long.id]);
  expect(mesa.vault.goals('lantern-cove', { exclude: long.id, limit: 1 }).map((g) => g.id)).toEqual(
    [archived.id],
  );
});

test('the calling session is left out by default; a bad limit and an unknown project are refused', () => {
  const own = sessions.create(() => newSession({ goal: 'This one' }));
  const inside = createMesa(
    'default',
    testDeps(home, { env: { MESA_SESSION_ID: own.id, MESA_PROFILE: 'default' } }),
  );
  expect(inside.vault.goals('lantern-cove')).toEqual([]);
  expect(mesa.vault.goals('lantern-cove').map((g) => g.goal)).toEqual(['This one']);
  expect(thrown(() => mesa.vault.goals('lantern-cove', { limit: 0 }))).toEqual({
    code: 'usage',
    message: 'the limit must be a positive whole number, not 0',
  });
  expect(thrown(() => mesa.vault.goals('driftwood')).code).toBe('not_found');
});

test('a session lists its goal on each of its projects, its additional ones too', () => {
  mkdirSync(join(home, 'src/tide-pool'));
  mesa.projects.register(join(home, 'src/tide-pool'), true);
  const across = sessions.create(() =>
    multiProjectSession({ startedAt: at(2), goal: 'Wire both' }),
  );
  sessions.create(() => newSession({ startedAt: at(1), project: 'driftwood', goal: 'Elsewhere' }));
  expect(mesa.vault.goals('tide-pool').map((g) => g.id)).toEqual([across.id]);
  expect(mesa.vault.goals('lantern-cove').map((g) => g.goal)).toEqual(['Wire both']);
});
