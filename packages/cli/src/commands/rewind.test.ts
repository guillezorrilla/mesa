import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('rewind JSON exposes an empty week without inventing provider activity', async () => {
  await cli.withProject();
  const result = await cli.mesa('rewind', '--json');
  expect(result.code).toBe(0);
  expect(result.json.data).toMatchObject({ notes: [], sessions: [], usage: { events: 0 } });
  expect(result.json.data.timezone).toEqual(expect.any(String));
});
