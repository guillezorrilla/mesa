import { CLAUDE_VERSION, fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented sessions in a fake tmux; the child runs mesa report from its own window.

const cli = cliHarness();
beforeEach(cli.reset);

test('report from a worker adds a done report for its parent; outside a window it is a usage error', async () => {
  cli.run = scriptedRunner({ tmux: fakeTmux().answer, claude: CLAUDE_VERSION }).run;
  await cli.withProject();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  await cli.mesa('reports', '--json');

  const outside = await cli.mesa('report', 'done', 'x', '--json');
  expect(outside.code).toBe(2);
  expect(outside.json.error.message).toMatch(/no Mesa window/);
  expect((await cli.mesa('reports', '--json')).json.data.reports).toEqual([]);

  cli.env = { MESA_SESSION_ID: child, MESA_PROFILE: 'default' };
  const made = await cli.mesa(
    'report',
    'done',
    'Counted 12 tide tables; none missing',
    '--files',
    'docs/tides.md, docs/moon.md',
    '--json',
  );
  expect(made.code, made.stdout).toBe(0);
  expect(made.json.data.report).toMatchObject({
    parent,
    child,
    kind: 'done',
    outcome: 'succeeded',
    message: 'Counted 12 tide tables; none missing',
    files: ['docs/tides.md', 'docs/moon.md'],
  });
  expect((await cli.mesa('report', 'done', 'again')).stdout).toContain(
    `reported done (succeeded) to ${parent}`,
  );
  cli.env = {};
  expect((await cli.mesa('reports', parent, '--json')).json.data.reports).toMatchObject([
    { kind: 'done', message: 'again' },
  ]);
  expect((await cli.mesa('show', child, '--json')).json.data.report).toMatchObject({
    kind: 'done',
    outcome: 'succeeded',
    message: 'again',
  });
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa report');
});
