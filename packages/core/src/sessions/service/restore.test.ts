import { expect, test } from 'vitest';
import { agentWorld, projectProfile, testStore } from '../../testing/index.js';
import type { EachResult } from '../record/each.js';
import type { SessionRecord } from '../record/record.js';

/** Each restored session's predecessor, and each failure's message, by id. */
const outcome = ({ items }: EachResult<SessionRecord>) =>
  items.map((i) => (i.ok ? `${i.id} -> ${i.result.resumedFrom}` : `${i.id}: ${i.error.message}`));

test("a restart's sessions restore with their names; one its agent exited waits for Restore all", async () => {
  const world = agentWorld();
  const { mesa, home } = projectProfile(world.run);
  const named = (await mesa.sessions.open('lantern-cove')).result;
  const plain = (await mesa.sessions.open('lantern-cove')).result;
  const exited = (await mesa.sessions.open('lantern-cove')).result;
  const store = testStore(home);
  store.update(named.id, { agentName: 'tidy-lanterns' });
  // It ended on /exit before the restart: its agent's own status 0.
  store.update(exited.id, (r) => ({
    events: [...r.events, { type: 'exited', at: r.startedAt, status: 0 }],
  }));
  world.tmux.windows.splice(0); // the machine restarted

  const restored = await mesa.sessions.restore({ interrupted: true });
  expect(outcome(restored)).toEqual([`${named.id} -> ${named.id}`, `${plain.id} -> ${plain.id}`]);
  const successors = restored.items.flatMap((i) => (i.ok ? [i.result] : []));
  expect(successors[0]?.agentName).toBe('tidy-lanterns');
  const live = await mesa.sessions.list();
  expect(live.filter((r) => successors.some((s) => s.id === r.id) && r.alive)).toHaveLength(2);

  expect(outcome(await mesa.sessions.restore())).toEqual([`${exited.id} -> ${exited.id}`]);
});

test('a window gone before the last boot is not a restart of this one', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run, { bootedAt: new Date('2026-09-25T00:00:00.000Z') });
  await mesa.sessions.open('lantern-cove');
  world.tmux.windows.splice(0);
  await mesa.sessions.list(); // a look before that boot recorded its exit

  expect(await mesa.sessions.restore({ interrupted: true })).toEqual({ items: [] });
  expect((await mesa.sessions.restore()).items).toHaveLength(1);
});

test('a session that cannot resume is listed with its error, and the others still restore', async () => {
  const world = agentWorld();
  const { mesa, home } = projectProfile(world.run);
  const first = (await mesa.sessions.open('lantern-cove')).result;
  const second = (await mesa.sessions.open('lantern-cove')).result;
  // Its folder was removed while the machine was off.
  testStore(home).update(first.id, { cwd: `${home}/gone` });
  world.tmux.windows.splice(0);

  expect(outcome(await mesa.sessions.restore({ interrupted: true }))).toEqual([
    expect.stringMatching(new RegExp(`^${first.id}: .*is gone`)),
    `${second.id} -> ${second.id}`,
  ]);
});
