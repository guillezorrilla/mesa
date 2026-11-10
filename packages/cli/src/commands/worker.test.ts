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

test("worker --task starts a ready task, whose worker's done report readies its dependent", async () => {
  await cli.withTwoProjects();
  const lead = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  cli.env = { MESA_SESSION_ID: lead, MESA_PROFILE: 'default' };
  const a = (await cli.mesa('tasks', 'create', 'Parse the tide tables', '--json')).json.data;
  const b = (await cli.mesa('tasks', 'create', 'Draw the chart', '--deps', a.id, '--json')).json
    .data;

  const pending = await cli.mesa('worker', 'lantern-cove', '--task', b.id, '--json');
  expect(pending.code).toBe(2);
  expect(pending.json.error.message).toBe(`task ${b.id} is pending, not ready`);
  const both = await cli.mesa('worker', 'lantern-cove', 'x', '--task', a.id, '--json');
  expect(both.json.error.message).toBe('pass a task text or --task <id>, not both');

  const started = await cli.mesa('worker', 'lantern-cove', '--task', a.id, '--json');
  expect(started.code, started.stdout).toBe(0);
  const { task, worker } = started.json.data;
  expect(task).toMatchObject({ id: a.id, state: 'running', worker: worker.id });
  expect(worker).toMatchObject({ parent: lead, brief: true });
  expect((await cli.mesa('show', worker.id, '--json')).json.data.task).toBe(a.id);
  expect((await cli.mesa('goal', worker.id)).stdout).toContain('Parse the tide tables');

  cli.env = { MESA_SESSION_ID: worker.id, MESA_PROFILE: 'default' };
  expect((await cli.mesa('report', 'done', 'Parsed 12 tables')).code).toBe(0);
  expect((await cli.mesa('tasks', 'show', a.id, '--json')).json.data.state).toBe('succeeded');
  const ready = (await cli.mesa('tasks', '--ready', '--json')).json.data.tasks;
  expect(ready.map((t: { id: string }) => t.id)).toEqual([b.id]);
});
