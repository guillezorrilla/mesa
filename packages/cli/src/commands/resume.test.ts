import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('resume --all --interrupted reopens the sessions a restart ended, each as a new session', async () => {
  const tmux = cli.withTmux();
  await cli.withProject();
  const first = (await mesa('open', 'lantern-cove')).stdout.trim();
  const second = (await mesa('open', 'lantern-cove')).stdout.trim();
  tmux.windows.splice(0); // the machine restarted

  const restored = await mesa('resume', '--all', '--interrupted', '--json');
  expect(restored.code).toBe(0);
  expect(restored.json.data.items).toMatchObject([
    { id: first, ok: true, result: { resumedFrom: first } },
    { id: second, ok: true, result: { resumedFrom: second } },
  ]);
  expect((await mesa('resume', '--all')).stdout).toBe('nothing to restore\n');
  expect((await mesa('resume', '--json')).json.error).toMatchObject({ code: 'usage' });
  expect((await mesa('resume', first, '--interrupted', '--json')).json.error).toMatchObject({
    code: 'usage',
  });
});
