import { expect, test } from 'vitest';
import { CLAUDE_VERSION, fakeTmux, projectProfile, scriptedRunner } from '../../testing/index.js';

const setup = () => {
  const world = fakeTmux();
  const { mesa } = projectProfile(
    scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run,
  );
  return { mesa, world };
};

test('confirmed stop cancels queued descendants before ending their parent', async () => {
  const { mesa, world } = setup();
  const parent = (await mesa.sessions.open('lantern-cove')).result;
  const child = (await mesa.sessions.open('lantern-cove', { parent: parent.id, after: parent.id }))
    .result;
  const grandchild = (
    await mesa.sessions.open('lantern-cove', { parent: child.id, after: child.id })
  ).result;
  const ids = [grandchild.id, child.id, parent.id];
  await expect(
    mesa.sessions.stopDescendants(parent.id, true, [child.id, parent.id]),
  ).rejects.toMatchObject({
    code: 'usage',
  });
  expect((await mesa.sessions.show(parent.id)).endedAt).toBeUndefined();
  const stopped = await mesa.sessions.stopDescendants(parent.id, true, ids);
  expect(stopped.items.map((item) => [item.id, item.ok && item.result.outcome])).toEqual([
    [grandchild.id, 'cancelled'],
    [child.id, 'cancelled'],
    [parent.id, 'killed'],
  ]);
  expect(world.windows).toHaveLength(0);
  expect((await mesa.sessions.show(grandchild.id)).lastState.state).toBe('stopped');
});

test('descendant removal reports a live child and preserves its parent for retry', async () => {
  const { mesa } = setup();
  const parent = (await mesa.sessions.open('lantern-cove')).result;
  const child = (await mesa.sessions.open('lantern-cove', { parent: parent.id })).result;
  await mesa.sessions.stop(parent.id, true);
  const failed = await mesa.sessions.removeDescendants(parent.id, {}, [child.id, parent.id]);
  expect(failed.items).toMatchObject([
    { id: child.id, ok: false, error: { code: 'usage' } },
    { id: parent.id, ok: false, skipped: true },
  ]);
  expect((await mesa.sessions.show(parent.id)).id).toBe(parent.id);
  await mesa.sessions.stop(child.id, true);
  const removed = await mesa.sessions.removeDescendants(parent.id, {}, [child.id, parent.id]);
  expect(removed.items.map((item) => [item.id, item.ok])).toEqual([
    [child.id, true],
    [parent.id, true],
  ]);
  await expect(mesa.sessions.show(parent.id)).rejects.toMatchObject({ code: 'not_found' });
});
