import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_VERSION, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test("view shows a project's sessions side by side, laid out by its mesa.yaml", async () => {
  const world = cli.withTmux();
  const dir = await cli.withProject();
  expect(await mesa('view', 'lantern-cove', '--app')).toMatchObject({
    code: 3,
    stderr: 'no session of lantern-cove has a window to view; mesa open lantern-cove\n',
  });
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const b = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const views = () => world.windows.filter((w) => w.project.startsWith('_view-'));

  // Unset, the layout is tiled; in the app, it opens there.
  const { json } = await mesa('view', 'lantern-cove', '--app', '--json');
  expect(json.data).toEqual({
    opened: true,
    project: 'lantern-cove',
    sessions: [a, b],
    layout: 'tiled',
    app: 'Terminal',
  });
  // One view window of its own, its first pane a terminal on the oldest session's window.
  expect(views().map((w) => w.window)).toEqual(['lantern-cove']);
  expect(views()[0]?.launch).toMatch(
    new RegExp(`^unset TMUX; exec 'tmux' .*'=_view-\\w+:=claude-${a}'$`),
  );
  expect((await mesa('windows', '--json')).json.data).toHaveLength(2);

  // Here, with mesa.yaml's layout: the argv that attaches this terminal to the view.
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\ntmux:\n  layout: even-vertical\n');
  const here = await mesa('view', 'lantern-cove');
  expect(here.stdout).toBe('viewing 2 sessions of lantern-cove, even-vertical, here\n');
  expect(here.exec).toEqual([
    'tmux',
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'attach-session',
    '-t',
    `=${views()[1]?.project}`,
    ';',
    'set-option',
    'destroy-unattached',
    'on',
  ]);
  cli.tty = false;
  expect((await mesa('view', 'lantern-cove')).code).toBe(2);
});

test('a layout tmux lacks, or an app that cannot open, leaves no view behind', async () => {
  const world = cli.withTmux();
  const dir = await cli.withProject();
  await mesa('open', 'lantern-cove');
  const views = () => world.windows.filter((w) => w.project.startsWith('_view-'));
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\ntmux:\n  layout: sideways\n');
  const bad = await mesa('view', 'lantern-cove', '--app');
  expect(bad.code).toBe(2);
  expect(bad.stderr).toMatch(/^tmux cannot lay out a view as sideways: invalid layout/);
  expect(views()).toEqual([]);

  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\n');
  cli.run = scriptedRunner(
    { tmux: world.answer, claude: CLAUDE_VERSION },
    { failing: ['open'] },
  ).run;
  const closed = await mesa('view', 'lantern-cove', '--app');
  expect(closed.stderr).toBe('could not open Terminal: exit 1\n');
  expect(views()).toEqual([]);
});
