import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('gates create blocks a task, gates lists it, and resolve unblocks it', async () => {
  await mesa('init', '--vault', 'vault');
  const task = (await mesa('tasks', 'create', 'Parse the tide tables', '--json')).json.data;
  const made = await mesa(
    'gates',
    'create',
    '--task',
    task.id,
    'Store tide heights in metres or feet?',
    '--options',
    'metres,feet',
    '--json',
  );
  const gate = made.json.data;
  expect(gate).toMatchObject({ task: task.id, options: ['metres', 'feet'] });
  expect((await mesa('tasks', 'show', task.id, '--json')).json.data.state).toBe('blocked');
  expect((await mesa('tasks', '--ready', '--json')).json.data.tasks).toEqual([]);
  expect((await mesa('tasks', 'show', task.id)).stdout).toContain(`gate ${gate.id} open`);
  expect((await mesa('gates', '--task', task.id, '--json')).json.data.gates).toEqual([gate]);
  expect((await mesa('gates')).stdout).toContain(`${gate.id}  ${task.id}`);

  const one = await mesa(
    'gates',
    'create',
    '--task',
    task.id,
    'Which?',
    '--options',
    'a',
    '--json',
  );
  expect(one.json.error.code).toBe('usage');
  const twice = await mesa('gates', 'create', '--task', task.id, 'Which?', '--options', 'a,a');
  expect(twice.code).toBe(2);

  cli.env = { MESA_SESSION_ID: 'stranger', MESA_PROFILE: 'default' };
  const refused = await mesa('gates', 'resolve', gate.id, 'metres', '--json');
  expect(refused.json.error.message).toBe(
    'only a person resolves a gate: run it outside a Mesa window or use the app',
  );
  cli.env = {};
  const resolved = await mesa('gates', 'resolve', gate.id, 'metres', '--json');
  expect(resolved.json.data).toMatchObject({ id: gate.id, option: 'metres' });
  expect((await mesa('tasks', 'show', task.id, '--json')).json.data.state).toBe('ready');
  expect((await mesa('gates', 'resolve', gate.id, 'feet', '--json')).json.error.code).toBe('usage');
  expect((await mesa('gates', 'resolve', 'g-nope', 'feet', '--json')).json.error.code).toBe(
    'not_found',
  );
  expect((await mesa('help', '--agent')).stdout).toContain('mesa gates resolve');
});
