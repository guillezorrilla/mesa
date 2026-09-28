import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('fork --json creates a child session and keeps the source', async () => {
  cli.withTmux();
  await cli.withProject();
  const source = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const forked = await cli.mesa('fork', source.id, '--json');
  expect(forked.json).toMatchObject({
    ok: true,
    data: { parent: source.id, agent: 'claude', receipt: null },
  });
  expect((await cli.mesa('show', source.id, '--json')).json.data.endedAt).toBeUndefined();
});
