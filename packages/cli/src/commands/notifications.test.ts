import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('notification delivery and acknowledgement use the profile inbox through CLI JSON', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect((await cli.mesa('notifications', 'delivery', '--json')).json.data).toEqual({
    kind: 'none',
  });
  mkdirSync(cli.paths.events, { recursive: true });
  writeFileSync(
    join(cli.paths.events, `${id}.jsonl`),
    `${JSON.stringify({ at: '2026-09-24T12:00:01.000Z', agent: 'claude', event: 'Stop' })}\n`,
  );
  const plan = (await cli.mesa('notifications', 'delivery', '--json')).json.data;
  expect(plan).toMatchObject({ kind: 'notice', target: { kind: 'session', id }, sound: false });
  expect((await cli.mesa('notifications', 'delivered', plan.id, '--json')).json.data).toEqual({
    ids: [plan.id],
    delivered: true,
  });
  expect((await cli.mesa('notifications', 'delivery', '--json')).json.data).toEqual({
    kind: 'none',
  });
});

test('notifications clear --all clears the whole inbox and reports the count', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  mkdirSync(cli.paths.events, { recursive: true });
  const stop = (at: string) => `${JSON.stringify({ at, agent: 'claude', event: 'Stop' })}\n`;
  writeFileSync(
    join(cli.paths.events, `${id}.jsonl`),
    stop('2026-09-24T12:00:01.000Z') + stop('2026-09-24T12:00:05.000Z'),
  );
  expect((await cli.mesa('notifications', '--json')).json.data).toHaveLength(2);
  expect((await cli.mesa('notifications', 'clear', '--all', '--json')).json.data).toEqual({
    count: 2,
  });
  expect((await cli.mesa('notifications', '--json')).json.data).toEqual([]);
  expect((await cli.mesa('notifications', 'clear', '--json')).json.error.code).toBe('usage');
});
