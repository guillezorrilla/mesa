import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('search --json returns project and action destinations for this profile', async () => {
  await cli.withProject();
  const project = await cli.mesa('search', 'lantern', '--json');
  expect(project.json.data).toMatchObject([
    { kind: 'project', id: 'lantern-cove', label: 'lantern-cove' },
    { kind: 'vault', id: 'lantern', label: 'Search vault' },
  ]);
  const missing = await cli.mesa('search', 'nothing-matches', '--json');
  expect(missing.json.data).toMatchObject([{ kind: 'vault', id: 'nothing-matches' }]);
});

test('search --json carries kind navigation and the shortcut that triggers a hit', async () => {
  await cli.withProject();
  const grid = await cli.mesa('search', 'ogv', '--json');
  expect(grid.json.data[0]).toMatchObject({ kind: 'navigation', id: 'grid' });
  const switcher = await cli.mesa('search', 'switch', '--json');
  expect(switcher.json.data[0]).toMatchObject({ id: 'switch-session', shortcut: 'Mod+Shift+K' });
  expect((await cli.mesa('search', 'switch')).stdout).toContain('Mod+Shift+K');
});

test('search --sessions lists only open sessions; ended ones only when typed', async () => {
  cli.withTmux();
  await cli.withProject({ layOut: false });
  const ended = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  const live = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id;
  await cli.mesa('stop', ended);
  const ids = async (...words: string[]) =>
    (await cli.mesa('search', '--sessions', ...words, '--json')).json.data.map(
      (hit: { kind: string; id: string }) => `${hit.kind}:${hit.id}`,
    );
  expect(await ids()).toEqual([`session:${live}`]);
  expect(await ids('lantern')).toEqual([`session:${live}`, `session:${ended}`]);
});
