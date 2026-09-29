import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('diagnostics CLI JSON filters recent profile hook metadata', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  mkdirSync(cli.paths.events, { recursive: true });
  writeFileSync(
    join(cli.paths.events, `${id}.jsonl`),
    `${JSON.stringify({ at: '2026-09-24T12:00:00.000Z', agent: 'claude', event: 'Stop', payload: { prompt: 'do not print' } })}\n`,
  );
  const result = await cli.mesa('diagnostics', '--event', 'Stop', '--json');
  expect(result.json.data).toMatchObject({
    total: 1,
    events: [{ session: id, event: 'Stop' }],
  });
  expect(JSON.stringify(result.json)).not.toContain('do not print');
  expect((await cli.mesa('diagnostics', '--limit', '201')).code).toBe(2);
});
