import { expect, test } from 'vitest';
import { agentWorld, projectProfile, testStore } from '../testing/index.js';

test('parent edits change the tree without changing the queued wait, and cycles are refused', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const first = (await mesa.sessions.open('lantern-cove')).result;
  const queued = (await mesa.sessions.open('lantern-cove', { after: first.id })).result;
  const child = (await mesa.sessions.open('lantern-cove', { after: queued.id })).result;
  const updated = (await mesa.sessions.dependencies(queued.id, { parent: null })).result;
  expect(updated.parent).toBeUndefined();
  expect(updated.after).toBe(first.id);
  await expect(mesa.sessions.dependencies(queued.id, { parent: child.id })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('cycle'),
  });
  await expect(mesa.sessions.dependencies(queued.id, { after: child.id })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('cycle'),
  });
  await expect(mesa.sessions.dependencies(first.id, { after: queued.id })).rejects.toMatchObject({
    code: 'usage',
  });
  expect((await mesa.sessions.show(queued.id)).after).toBe(first.id);
});

test('editing a wait target moves the queue, and force-start bypasses it explicitly', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const first = (await mesa.sessions.open('lantern-cove')).result;
  const other = (await mesa.sessions.open('lantern-cove')).result;
  const queued = (await mesa.sessions.open('lantern-cove', { after: first.id })).result;
  const moved = (await mesa.sessions.dependencies(queued.id, { after: other.id })).result;
  expect(moved).toMatchObject({
    after: other.id,
    parent: first.id,
    lastState: { state: 'queued' },
  });
  await mesa.sessions.stop(first.id, true);
  expect((await mesa.sessions.show(queued.id)).lastState.state).toBe('queued');
  const started = (await mesa.sessions.forceStart(queued.id)).result;
  expect(started.after).toBeUndefined();
  expect(started.parent).toBe(first.id);
  expect(world.tmux.windows.filter((window) => window.window === started.tmux.window)).toHaveLength(
    1,
  );
  await expect(mesa.sessions.forceStart(queued.id)).rejects.toMatchObject({ code: 'usage' });
});

test('changing a wait target to an ended session starts it, unless its claim is in progress', async () => {
  const world = agentWorld();
  const { home, mesa } = projectProfile(world.run);
  const ended = (await mesa.sessions.open('lantern-cove')).result;
  const live = (await mesa.sessions.open('lantern-cove')).result;
  const queued = (await mesa.sessions.open('lantern-cove', { after: live.id })).result;
  await mesa.sessions.stop(ended.id, true);
  const started = (await mesa.sessions.dependencies(queued.id, { after: ended.id })).result;
  expect(started.lastState.state).toBe('idle');
  const waiting = (await mesa.sessions.open('lantern-cove', { after: live.id })).result;
  testStore(home).update(waiting.id, {
    pending: { claimedAt: new Date().toISOString() },
  });
  await expect(mesa.sessions.dependencies(waiting.id, { after: ended.id })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('starting'),
  });
});
