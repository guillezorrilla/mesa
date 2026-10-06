import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  agentWorld,
  CODEX_MOUNT,
  profilePaths,
  projectProfile,
  steppingClock,
} from '../testing/index.js';

const THREAD = '01a0e14e-be41-72f1-a81b-e25d2198602a';

test('resume reopens a Codex thread embedded, in its recorded folder, with -C', async () => {
  const world = agentWorld();
  const { mesa, dir } = projectProfile(world.run, {
    env: world.codex.env,
    clock: steppingClock('2026-09-24T12:00:00.000Z'),
  });
  const { result: opened } = await mesa.sessions.open('lantern-cove', { agent: 'codex' });
  // Its thread started just after its window opened; it was stopped before a look read it.
  const started = new Date(Date.parse(opened.startedAt) + 1).toISOString();
  world.codex.rollout({ id: THREAD, cwd: dir, startedAt: started });
  await mesa.sessions.stop(opened.id, true);
  await expect(mesa.sessions.resume(opened.id)).rejects.toMatchObject({ code: 'not_found' });
  // A look reads it, and keeps it on the stopped record.
  expect((await mesa.sessions.show(opened.id)).agentSessionId).toBe(THREAD);

  const { record } = (await mesa.sessions.resume(opened.id)).result;
  expect(record).toMatchObject({ agent: 'codex', agentSessionId: THREAD, resumedFrom: opened.id });
  const window = world.tmux.windows.at(-1);
  expect(window).toMatchObject({ window: `codex-${record.id}`, path: dir });
  expect(window?.launch).toBe(
    `codex -c mesa.embedded=true ${CODEX_MOUNT} resume '${THREAD}' -C '${dir}'`,
  );
});

test('resumed Antigravity logs its own native ID and reports a later clear as conflicting', async () => {
  const world = agentWorld();
  const { mesa, home } = projectProfile(world.run);
  const opened = (await mesa.sessions.open('lantern-cove', { agent: 'antigravity' })).result;
  const logs = profilePaths(home, 'default').logs;
  const original = '002f58d1-9e29-4682-9bc1-3a2dc5da1115';
  const cleared = 'cd66cf01-f466-4c11-8f12-a8fd0885d9f4';
  writeFileSync(join(logs, `${opened.id}.agy.log`), `Created conversation ${original}\n`);
  expect((await mesa.sessions.show(opened.id)).agentSessionId).toBe(original);
  await mesa.sessions.stop(opened.id, true);

  const resumed = (await mesa.sessions.resume(opened.id)).result.record;
  const log = join(logs, `${resumed.id}.agy.log`);
  expect(world.tmux.windows.at(-1)?.launch).toBe(
    `umask 077; exec agy --log-file '${log}' --conversation '${original}'`,
  );
  expect(existsSync(logs)).toBe(true);
  writeFileSync(log, `Created conversation ${original}\nCreated conversation ${cleared}\n`);
  expect((await mesa.sessions.show(resumed.id)).instructions.state).toBe('conflicting');
});

test('two resumes at once start one successor and refuse the other', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.stop(opened.id, true);
  const windows = world.tmux.windows.length;
  const [a, b] = await Promise.allSettled([
    mesa.sessions.resume(opened.id),
    mesa.sessions.resume(opened.id),
  ]);
  const won = [a, b].filter((r) => r.status === 'fulfilled');
  const lost = [a, b].filter((r) => r.status === 'rejected');
  expect(won).toHaveLength(1);
  expect(lost).toHaveLength(1);
  const successor = (
    won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof mesa.sessions.resume>>>
  ).value.result.record;
  expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
    code: 'usage',
    message: expect.stringContaining(`already resumed as ${successor.id}`),
  });
  expect(world.tmux.windows).toHaveLength(windows + 1);
  expect((await mesa.sessions.show(opened.id)).resumedBy).toBe(successor.id);
  // The refused resume's record is gone again: the old session and its one successor stay.
  expect((await mesa.sessions.list(true)).map((r) => r.id).sort()).toEqual(
    [opened.id, successor.id].sort(),
  );
});

test('a resume whose start fails gives its claim back', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.stop(opened.id, true);
  // tmux cannot start a window once the session is stopped, as a broken server would.
  world.tmux.failing = ['new-session', 'new-window'];
  await expect(mesa.sessions.resume(opened.id)).rejects.toMatchObject({ code: 'internal' });
  expect((await mesa.sessions.show(opened.id)).resumedBy).toBeUndefined();
  expect((await mesa.sessions.list(true)).map((r) => r.id)).toEqual([opened.id]);
  world.tmux.failing = [];
  const { record } = (await mesa.sessions.resume(opened.id)).result;
  expect((await mesa.sessions.show(opened.id)).resumedBy).toBe(record.id);
});
