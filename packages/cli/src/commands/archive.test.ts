import { testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('archive ends a live session, hides it, and unarchive retains its record without restarting', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const archived = (await cli.mesa('archive', id, '--json')).json.data;
  expect(archived).toMatchObject({
    id,
    archivedAt: expect.any(String),
    endedAt: expect.any(String),
  });
  expect(world.windows.some((window) => window.window === `claude-${id}`)).toBe(false);
  expect(
    (await cli.mesa('sessions', '--json')).json.data.map((row: { id: string }) => row.id),
  ).not.toContain(id);
  expect(
    (await cli.mesa('sessions', '--all', '--json')).json.data.map((row: { id: string }) => row.id),
  ).toContain(id);
  expect(testStore(cli.home).get(id).archivedAt).toBeTruthy();

  const unarchived = (await cli.mesa('unarchive', id, '--json')).json.data;
  expect(unarchived.id).toBe(id);
  expect(unarchived.archivedAt).toBeUndefined();
  expect(unarchived.endedAt).toBeTruthy();
  expect(
    (await cli.mesa('sessions', '--json')).json.data.map((row: { id: string }) => row.id),
  ).toContain(id);
  expect(world.windows.some((window) => window.window === `claude-${id}`)).toBe(false);
});
