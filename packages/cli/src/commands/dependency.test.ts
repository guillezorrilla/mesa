import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('dependency and force-start expose separate parent and queue changes through JSON', async () => {
  cli.withTmux();
  await cli.withProject();
  const first = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const other = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const queued = (await cli.mesa('open', 'lantern-cove', '--after', first.id, '--json')).json.data;
  const parent = await cli.mesa('dependency', queued.id, '--parent', 'none', '--json');
  expect(parent.json.data).toMatchObject({ id: queued.id, after: first.id });
  expect(parent.json.data.parent).toBeUndefined();
  const wait = await cli.mesa('dependency', queued.id, '--after', other.id, '--json');
  expect(wait.json.data).toMatchObject({ id: queued.id, after: other.id });
  const started = await cli.mesa('force-start', queued.id, '--json');
  expect(started.json.data).toMatchObject({ id: queued.id, lastState: { state: 'idle' } });
  expect(started.json.data.after).toBeUndefined();
});
