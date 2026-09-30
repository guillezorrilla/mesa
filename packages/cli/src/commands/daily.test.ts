import { readFileSync, writeFileSync } from 'node:fs';
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

test('log JSON and Daily retain an event after an unterminated prior-day line', async () => {
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  const prior = '- 2026-09-23T12:00:00.000Z Prior invented event';
  const log = join(cli.home, 'vault/log.md');
  writeFileSync(log, prior);
  const logged = await cli.mesa('log', 'Fresh invented CLI event', '--json');
  expect(logged.code).toBe(0);
  expect(readFileSync(log, 'utf8')).toBe(`${prior}\n${logged.json.data.entry}\n`);
  expect((await cli.mesa('daily', '--json')).json.data).toMatchObject({ changed: false, log: 1 });
  expect(
    readFileSync(join(cli.home, 'vault/daily/2026-09-24.md'), 'utf8').match(
      /Fresh invented CLI event/g,
    ),
  ).toHaveLength(1);
});
