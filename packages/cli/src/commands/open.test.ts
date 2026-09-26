import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('open prints the session id, --json the record, and --attach hands back the attach argv', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const dir = join(cli.home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  await mesa('register', '--create', dir);

  const { json } = await mesa('open', 'lantern-cove', '--json');
  expect(json.data).toMatchObject({
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    tmux: { socket: 'mesa-default', session: 'lantern-cove' },
    receipt: { id: expect.stringMatching(/^01TEST/) },
  });
  const plain = await mesa('open', 'lantern-cove');
  expect(plain.stdout).toMatch(/^[0-9a-z]{8}\n$/);
  expect(
    JSON.parse(
      readFileSync(join(cli.home, `.mesa/default/sessions/${plain.stdout.trim()}.json`), 'utf8'),
    ).agentSessionId,
  ).toBe('00000000-0000-4000-8000-000000000002');
  expect(plain.exec).toBeUndefined();

  const attached = await mesa('open', 'lantern-cove', '--attach');
  const id = attached.stdout.trim();
  expect(attached.exec).toEqual([
    'tmux',
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    // Its own view of the project's session, so other terminals keep their windows.
    'new-session',
    '-t',
    '=lantern-cove',
    '-s',
    expect.stringMatching(/^_view-[0-9a-z]{8}$/),
    ';',
    'set-option',
    'destroy-unattached',
    'on',
    ';',
    'select-window',
    '-t',
    expect.stringMatching(new RegExp(`^=_view-[0-9a-z]{8}:=claude-${id}$`)),
  ]);
  expect(await mesa('open', 'tide')).toMatchObject({ code: 3 });
  expect(await mesa('open', 'lantern-cove', '--agent', 'codex')).toMatchObject({
    code: 7,
    stderr: 'codex support is planned in #43\n',
  });
});

test('open --goal and --goal-file start with a goal; mesa goal prints it', async () => {
  const world = fakeTmux();
  cli.run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await cli.withProject({ layOut: false });
  const opened = await mesa('open', 'lantern-cove', '--goal', 'Print the word ready and stop');
  const id = opened.stdout.split('\n')[0] ?? '';
  expect(world.windows.at(-1)?.launch).toBe(
    "claude --session-id 00000000-0000-4000-8000-000000000001 'Print the word ready and stop'",
  );
  expect((await mesa('goal', id, '--json')).json).toEqual({
    ok: true,
    data: { id, goal: 'Print the word ready and stop' },
  });
  expect((await mesa('goal', id)).stdout).toBe('Print the word ready and stop\n');

  // A relative --goal-file is read from where mesa runs.
  writeFileSync(join(cli.home, 'goal.md'), 'From a file\n');
  const fromFile = await mesa('open', 'lantern-cove', '--goal-file', 'goal.md', '--json');
  expect(fromFile.json.data.goal).toBe('From a file\n');
  expect(world.windows.at(-1)?.launch).toBe(
    "claude --session-id 00000000-0000-4000-8000-000000000002 'From a file\n'",
  );

  const plain = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect(await mesa('goal', plain)).toMatchObject({
    code: 3,
    stderr: `session ${plain} has no goal\n`,
  });
  expect(await mesa('open', 'lantern-cove', '--goal', '')).toMatchObject({
    code: 2,
    stderr: 'the goal is empty\n',
  });
});

test('open inside a session makes a child; sessions --tree indents it; --json names the links', async () => {
  const world = fakeTmux();
  cli.run = scriptedRunner({ tmux: world.answer, claude: '2.1.282 (Claude Code)' }).run;
  await cli.withProject({ layOut: false });
  const a = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  cli.env = { MESA_SESSION_ID: a, MESA_PROFILE: 'default' };
  const child = (await mesa('open', 'lantern-cove', '--json')).json.data;
  expect(child.parent).toBe(a);
  const loose = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  expect(loose.parent).toBeUndefined();
  expect(await mesa('open', 'lantern-cove', '--parent', 'zzzzzzzz')).toMatchObject({
    code: 3,
    stderr: 'no session zzzzzzzz to be the parent; see mesa sessions, or pass --no-parent\n',
  });

  const tree = (await mesa('sessions', '--tree')).stdout.split('\n').filter(Boolean);
  const at = (id: string) => tree.findIndex((line) => line.trimStart().startsWith(id));
  expect(tree[at(child.id)]).toMatch(new RegExp(`^  ${child.id} `));
  expect(at(child.id)).toBe(at(a) + 1);
  expect(tree[at(loose.id)]).toMatch(new RegExp(`^${loose.id} `));

  const rows = (await mesa('sessions', '--json')).json.data;
  const links = Object.fromEntries(
    rows.map((r: { id: string; parent?: string; children: string[] }) => [
      r.id,
      [r.parent ?? null, r.children],
    ]),
  );
  expect(links).toEqual({ [a]: [null, [child.id]], [child.id]: [a, []], [loose.id]: [null, []] });
  const treeRows = (await mesa('sessions', '--tree', '--json')).json.data;
  expect(treeRows.map((r: { depth: number }) => r.depth).sort()).toEqual([0, 0, 1]);
});
