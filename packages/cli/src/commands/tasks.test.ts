import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('tasks create, list --ready and show plan a graph; an unknown dep writes nothing', async () => {
  await mesa('init', '--vault', 'vault');
  const a = (await mesa('tasks', 'create', 'Parse the tide tables', '--graph', 'tides', '--json'))
    .json.data;
  expect(a).toMatchObject({ graph: 'tides', deps: [], state: 'ready' });
  const b = (
    await mesa(
      'tasks',
      'create',
      'Draw the tide chart',
      '--graph',
      'tides',
      '--deps',
      a.id,
      '--json',
    )
  ).json.data;
  expect(b).toMatchObject({ deps: [a.id], state: 'pending' });

  const ready = (await mesa('tasks', '--graph', 'tides', '--ready', '--json')).json.data;
  expect(ready.tasks.map((t: { id: string }) => t.id)).toEqual([a.id]);
  const shown = (await mesa('tasks', 'show', b.id, '--json')).json.data;
  expect(shown.dependencies).toEqual([{ id: a.id, spec: 'Parse the tide tables', state: 'ready' }]);
  expect((await mesa('tasks', 'show', b.id)).stdout).toContain(`waits on ${a.id} ready`);

  const before = (await mesa('tasks', '--json')).json.data;
  const refused = await mesa('tasks', 'create', 'x', '--deps', 't-nope', '--json');
  expect(refused.json.error.code).toBe('not_found');
  expect((await mesa('tasks', '--json')).json.data).toEqual(before);
  expect((await mesa('tasks', 'show', 't-nope', '--json')).json.error.code).toBe('not_found');
  expect((await mesa('help', '--agent')).stdout).toContain('mesa tasks create');
});
