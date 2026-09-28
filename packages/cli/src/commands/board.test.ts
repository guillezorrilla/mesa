import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('board --json uses validated profile preferences and session workflow labels', async () => {
  cli.withTmux();
  await cli.withProject();
  const session = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  await cli.mesa('workflow', session.id, 'review');
  expect(
    (await cli.mesa('config', 'set', 'board.view', 'workflow', '--json')).json.data.value,
  ).toBe('workflow');
  const board = (await cli.mesa('board', '--json')).json.data;
  expect(board.preferences.view).toBe('workflow');
  expect(
    board.groups.find((group: { key: string }) => group.key === 'review').rows[0],
  ).toMatchObject({
    id: session.id,
    workflowStatus: 'review',
  });
  expect((await cli.mesa('config', 'set', 'board.view', 'bad')).code).toBe(4);
  await cli.mesa('init', '--profile', 'other', '--vault', 'other-vault');
  expect((await cli.mesa('config', '--profile', 'other', '--json')).json.data.board.view).toBe(
    'list',
  );
});

test('board move --json persists order through core', async () => {
  cli.withTmux();
  await cli.withProject();
  const first = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const second = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  await cli.mesa('config', 'set', 'board.sort', 'manual');
  const moved = await cli.mesa('board', 'move', first.id, 'down', '--json');
  expect(moved.json.data.order).toEqual([second.id, first.id]);
  expect((await cli.mesa('config', '--json')).json.data.board.order).toEqual([second.id, first.id]);
  expect((await cli.mesa('board', 'move', first.id, 'sideways', '--json')).code).toBe(2);
  expect((await cli.mesa('board', 'move', 'ffffffff', 'up', '--json')).code).toBe(3);
});
