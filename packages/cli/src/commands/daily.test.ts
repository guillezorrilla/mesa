import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
test('daily rebuild and log JSON agree with the note; invalid dates refuse', async () => {
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  const first = await cli.mesa('daily', '--date', '2026-09-24', '--json');
  expect(first).toMatchObject({
    code: 0,
    json: {
      data: {
        path: 'daily/2026-09-24.md',
        date: '2026-09-24',
        changed: true,
        decisions: 0,
        changes: 0,
        log: 0,
      },
    },
  });
  expect((await cli.mesa('daily', '--json')).json.data.changed).toBe(false);
  expect((await cli.mesa('log', 'invented CLI event', '--json')).code).toBe(0);
  expect((await cli.mesa('daily', '--json')).json.data).toMatchObject({ changed: false, log: 1 });
  expect(readFileSync(join(cli.home, 'vault/daily/2026-09-24.md'), 'utf8')).toContain(
    'invented CLI event',
  );
  expect((await cli.mesa('daily', '--date', '2026-02-30', '--json')).json.error.code).toBe('usage');
});
