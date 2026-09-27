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
