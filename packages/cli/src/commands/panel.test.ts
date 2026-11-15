import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('mesa panel prints the panel a command drew: --json with its colours, text without', async () => {
  const world = cli.withTmux();
  await cli.withProject({ layOut: false });
  const id = (await mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const window = world.windows[0];
  if (!window) throw new Error('no window');
  window.screen = [
    '⏺ A reply.',
    '▔▔▔▔▔▔▔▔',
    '\x1b[1m   Session\x1b[0m',
    '   Total cost: $0.42',
  ].join('\n');
  expect((await mesa('panel', id, '/cost', '--json')).json.data).toEqual({
    session: id,
    command: '/cost',
    lines: ['\x1b[1m   Session\x1b[0m', '   Total cost: $0.42'],
  });
  expect((await mesa('panel', id, '/cost')).stdout).toBe('   Session\n   Total cost: $0.42\n');
});
