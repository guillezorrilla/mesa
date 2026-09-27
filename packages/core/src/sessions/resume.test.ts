import { expect, test } from 'vitest';
import { agentWorld, projectProfile, steppingClock } from '../testing/index.js';

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
  expect(window?.launch).toBe(`codex -c mesa.embedded=true resume ${THREAD} -C '${dir}'`);
});
