import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented projects over a tmux server in memory and the real git.

const cli = cliHarness();
beforeEach(cli.reset);

test('worker starts a briefed child of the caller in its own worktree; outside a window it needs --parent', async () => {
  await cli.withTwoProjects();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;

  const outside = await cli.mesa('worker', 'lantern-cove', 'x', '--json');
  expect(outside.code).toBe(2);
  expect(outside.json.error.message).toBe(
    'mesa worker runs inside a Mesa window; outside one pass --parent <id>',
  );
  const before = (await cli.mesa('sessions', '--all', '--json')).json.data.length;

  cli.env = { MESA_SESSION_ID: parent, MESA_PROFILE: 'default' };
  const made = await cli.mesa(
    'worker',
    'lantern-cove',
    'Parse the tide tables into JSON',
    '--json',
  );
  expect(made.code, made.stdout).toBe(0);
  const child = made.json.data;
  expect(child).toMatchObject({ parent, brief: true, project: 'lantern-cove' });
  expect(child.worktree.branch).toMatch(/^session\//);
  cli.env = {};
  expect((await cli.mesa('goal', child.id)).stdout).toContain(
    `[mesa] You are a worker started by session ${parent}.`,
  );
  const given = await cli.mesa('worker', 'lantern-cove', 'Chart it', '--parent', parent, '--json');
  expect(given.json.data).toMatchObject({ parent });
  expect((await cli.mesa('sessions', '--all', '--json')).json.data).toHaveLength(before + 2);
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa worker');
});
