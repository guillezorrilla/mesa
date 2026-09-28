import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('workflow --json sets and clears a durable label without changing agent state', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const changed = await cli.mesa('workflow', opened.id, 'review', '--json');
  expect(changed.json.data).toMatchObject({
    workflowStatus: 'review',
    lastState: opened.lastState,
    receipt: { id: expect.any(String) },
  });
  expect((await cli.mesa('sessions', '--json')).json.data[0].workflowStatus).toBe('review');
  const cleared = await cli.mesa('workflow', opened.id, 'clear', '--json');
  expect(cleared.json.data.workflowStatus).toBeUndefined();
  expect((await cli.mesa('workflow', opened.id, 'waiting-permission', '--json')).code).toBe(2);
});
