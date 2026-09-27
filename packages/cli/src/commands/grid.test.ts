import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('grid save/list/remove --json keeps session records and isolates profiles', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const saved = await cli.mesa('grid', 'save', 'Review', id, '--project', 'lantern-cove', '--json');
  expect(saved.json.data).toMatchObject({
    groups: [{ name: 'Review', project: 'lantern-cove', sessions: [id] }],
    receipt: { id: expect.any(String) },
  });
  expect((await cli.mesa('grid', '--json')).json.data).toEqual(saved.json.data.groups);
  await cli.mesa('init', '--profile', 'other', '--vault', 'other-vault');
  expect((await cli.mesa('grid', '--profile', 'other', '--json')).json.data).toEqual([]);
  expect((await cli.mesa('grid', 'save', 'Empty', '--json')).code).toBe(2);
  const removed = await cli.mesa('grid', 'remove', 'Review', '--json');
  expect(removed.json.data.groups).toEqual([]);
  expect((await cli.mesa('show', id, '--json')).json.data.id).toBe(id);
});
