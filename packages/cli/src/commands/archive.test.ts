import { staleLock, testStore } from '@mesa/core/testing';
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

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

test('archive with several ids archives each live session and reports one item per id', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const a = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const b = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const archived = await cli.mesa('archive', a, b, '--json');
  expect(archived.code).toBe(0);
  expect(archived.json.data.items).toMatchObject([
    { id: a, ok: true, result: { archivedAt: expect.any(String) } },
    { id: b, ok: true, result: { archivedAt: expect.any(String) } },
  ]);
  expect(world.windows).toHaveLength(0);
  const live = ids((await cli.mesa('sessions', '--json')).json.data);
  expect(live).not.toContain(a);
  expect(live).not.toContain(b);
  expect(ids((await cli.mesa('sessions', '--all', '--json')).json.data)).toEqual(
    expect.arrayContaining([a, b]),
  );
});

test('archive with an unknown id exits 3 naming it and archives none', async () => {
  cli.withTmux();
  await cli.withProject({ layOut: false });
  const a = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const refused = await cli.mesa('archive', a, 'zzzzzzzz', '--json');
  expect(refused.code).toBe(3);
  expect(refused.json.error).toMatchObject({
    code: 'not_found',
    message: expect.stringContaining('zzzzzzzz'),
  });
  expect(testStore(cli.home).get(a).archivedAt).toBeUndefined();
});

test('archive prints every item and exits 2 when one fails', async () => {
  cli.withTmux();
  await cli.withProject({ layOut: false });
  const a = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const b = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  await cli.mesa('stop', a, '--force');
  staleLock(cli.home, a);
  const out = await cli.mesa('archive', a, b);
  expect(out.code).toBe(2);
  expect(out.stdout).toMatch(new RegExp(`^${a}: .+\n${b}: archived\n$`));
  expect(testStore(cli.home).get(b).archivedAt).toBeTruthy();
  // The locked record is waited for, 400 pauses of 5 ms, before it fails.
}, 30_000);
