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

test('fork of a session across projects needs --branch (2), and --json lists its other worktree', async () => {
  const { tmux } = await cli.withTwoProjects();
  const source = (
    await cli.mesa('open', 'lantern-cove', '--with', 'tide-pool', '--worktree', '--json')
  ).json.data;
  const refused = await cli.mesa('fork', source.id, '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error).toEqual({
    code: 'usage',
    message: `session ${source.id} works in several projects: pass --branch so its fork gets worktrees of its own`,
  });
  const forked = await cli.mesa('fork', source.id, '--branch', 'try/x', '--json');
  expect(forked.code, forked.stdout).toBe(0);
  const data = forked.json.data;
  expect(data).toMatchObject({
    parent: source.id,
    worktree: { branch: 'try/x' },
    additional: [{ project: 'tide-pool', worktree: { branch: 'try/x' } }],
  });
  const launch = tmux.windows.find((w) => w.window === `claude-${data.id}`)?.launch ?? '';
  expect(launch).toContain(`--add-dir=${data.additional[0].worktree.path}`);
});
