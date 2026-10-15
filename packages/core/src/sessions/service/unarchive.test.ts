import { expect, test } from 'vitest';
import { agentWorld, projectProfile } from '../../testing/index.js';

test('unarchive with resume clears archivedAt and reopens the conversation, live in its project', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const { result: opened } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.archive(opened.id);
  expect((await mesa.sessions.list('archived')).map((r) => r.id)).toEqual([opened.id]);

  const { result, warning } = await mesa.sessions.unarchive(opened.id, { resume: true });
  expect(warning).toBeUndefined();
  expect(result).toMatchObject({ id: opened.id, archivedAt: undefined });
  expect(result.resumed).toMatchObject({ project: 'lantern-cove', resumedFrom: opened.id });
  expect(world.tmux.windows.at(-1)?.window).toBe(`claude-${result.resumed?.id}`);
  expect(await mesa.sessions.list('archived')).toEqual([]);
  const live = (await mesa.sessions.list()).find((r) => r.id === result.resumed?.id);
  expect(live).toMatchObject({ project: 'lantern-cove', alive: true });
});

test('unarchive without resume leaves it ended; one with nothing to resume warns why', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const terminal = (await mesa.sessions.open('lantern-cove', { terminal: true })).result;
  await mesa.sessions.archive(terminal.id);
  const windows = world.tmux.windows.length;

  const { result, warning } = await mesa.sessions.unarchive(terminal.id, { resume: true });
  expect(result.archivedAt).toBeUndefined();
  expect(result.resumed).toBeUndefined();
  expect(warning).toMatch(/^unarchived, not resumed: session \w+ is a plain terminal/);
  expect(world.tmux.windows).toHaveLength(windows);

  const { result: claude } = await mesa.sessions.open('lantern-cove');
  await mesa.sessions.archive(claude.id);
  const plain = await mesa.sessions.unarchive(claude.id);
  expect(plain.result).toMatchObject({ id: claude.id, endedAt: expect.any(String) });
  expect(plain.result.resumed).toBeUndefined();
});
