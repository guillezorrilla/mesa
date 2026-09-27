import { expect, test } from 'vitest';
import {
  agentWorld,
  codexWorld,
  projectProfile,
  steppingClock,
  tempDir,
} from '../../testing/index.js';
import { codexSessionId } from './rollouts.js';

const OPENED = '2026-09-24T12:00:00.000Z';
const FOLDER = '/src/lantern-cove';
const [A, B, C] = [
  '01a0e14e-be41-72f1-a81b-e25d2198602a',
  '01a0e14f-0000-7000-8000-000000000002',
  '01a0e150-0000-7000-8000-000000000003',
];

/** The thread for a window opened at OPENED in FOLDER, none of `taken` held. */
const idFor = (codex: ReturnType<typeof codexWorld>, taken: string[] = []) =>
  codexSessionId(
    { env: codex.env, home: tempDir() },
    { folder: FOLDER, since: OPENED },
    new Set(taken),
  );

test('the thread is the newest interactive one started in the folder after the window opened', () => {
  const codex = codexWorld();
  expect(idFor(codex)).toBeUndefined();
  codex.rollout({ id: A, cwd: FOLDER, startedAt: '2026-09-24T12:00:01.500Z' });
  expect(idFor(codex)).toBe(A);
  codex.rollout({ id: B, cwd: FOLDER, startedAt: '2026-09-24T12:03:00.000Z' });
  expect(idFor(codex)).toBe(B);
  // One another session holds is not this one's.
  expect(idFor(codex, [B])).toBe(A);
});

test('a thread in another folder, started before the window or after the stop, or headless is not it', () => {
  const codex = codexWorld();
  codex.rollout({ id: A, cwd: '/src/tide', startedAt: '2026-09-24T12:00:02.000Z' });
  codex.rollout({
    id: B,
    cwd: FOLDER,
    startedAt: '2026-09-24T11:59:59.000Z',
    writtenAt: '2026-09-24T12:01:00.000Z',
  });
  codex.rollout({
    id: C,
    cwd: FOLDER,
    startedAt: '2026-09-24T12:00:03.000Z',
    originator: 'codex_exec',
  });
  expect(idFor(codex)).toBeUndefined();
  codex.rollout({ id: A, cwd: FOLDER, startedAt: '2026-09-24T12:30:00.000Z' });
  const stopped = { folder: FOLDER, since: OPENED, until: '2026-09-24T12:10:00.000Z' };
  expect(codexSessionId({ env: codex.env, home: tempDir() }, stopped, new Set())).toBeUndefined();
});

test('a thread started after midnight is in the next day folder', () => {
  const codex = codexWorld();
  const late = '2026-09-24T23:59:58.000Z';
  codex.rollout({ id: A, cwd: FOLDER, startedAt: '2026-09-25T00:00:40.000Z' });
  expect(
    codexSessionId({ env: codex.env, home: tempDir() }, { folder: FOLDER, since: late }, new Set()),
  ).toBe(A);
});

test("a look at the board fills a Codex session's id from its rollout, never another's", async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(world.run, {
    env: world.codex.env,
    clock: steppingClock(OPENED),
  });
  const { result: first } = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  const { result: second } = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  // Before its first prompt, a thread has no rollout.
  expect((await mesa.sessions.show(first.id)).agentSessionId).toBeUndefined();

  // Each thread started just after its own window opened; the newer one is the second's.
  const after = (iso: string) => new Date(Date.parse(iso) + 1).toISOString();
  world.codex.rollout({ id: A, cwd: dir, startedAt: after(first.startedAt) });
  world.codex.rollout({ id: B, cwd: dir, startedAt: after(second.startedAt) });
  const rows = await mesa.sessions.list();
  expect(rows.map((r) => [r.id, r.managed, r.agentSessionId])).toEqual(
    expect.arrayContaining([
      [first.id, true, A],
      [second.id, true, B],
    ]),
  );
  // Saved, and listed as the session's own, never as a foreign row.
  expect(rows).toHaveLength(2);
  expect((await mesa.sessions.show(first.id)).agentSessionId).toBe(A);
});
