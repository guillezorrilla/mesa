import { fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('show, rename, and rm, as the issue types them: sessions shows the name, rm refuses a live one', async () => {
  const world = fakeTmux();
  cli.run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect((await mesa('show', id, '--json')).json.data).toMatchObject({ id, alive: true });
  expect((await mesa('show', id)).stdout).toMatch(/^project: lantern-cove$/m);
  expect(await mesa('show', 'zzzzzzzz')).toMatchObject({ code: 3 });

  expect((await mesa('rename', id, 'rm test')).stdout).toBe(`renamed ${id} to rm test\n`);
  expect((await mesa('sessions')).stdout.split('\n')[0]).toMatch(/^rm test {2}lantern-cove/);
  expect((await mesa('sessions', '--json')).json.data[0]).toMatchObject({ id, name: 'rm test' });

  expect(await mesa('rm', id)).toMatchObject({
    code: 2,
    stderr: `session ${id} is live: mesa stop ${id} first, or pass --force to close its window\n`,
  });
  const removed = await mesa('rm', id, '--force', '--json');
  expect(removed.json.data).toMatchObject({ id, record: true, window: true });
  expect(await mesa('show', id)).toMatchObject({ code: 3 });
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');
});
