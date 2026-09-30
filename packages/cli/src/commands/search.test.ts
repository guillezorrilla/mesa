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
