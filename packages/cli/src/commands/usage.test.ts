import { plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('usage JSON scopes period totals to the selected session', async () => {
  cli.withTmux();
  const dir = await cli.withProject();
  const first = (await cli.mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const nativeId = (await cli.mesa('show', first, '--json')).json.data.agentSessionId;
  plantTranscript(
    cli.home,
    nativeId,
    dir,
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-24T12:00:00.000Z',
      message: {
        id: 'msg_lantern',
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 3,
          output_tokens: 2,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
  );
  const all = await cli.mesa('usage', '--json');
  expect(all.code).toBe(0);
  expect(all.json.data.periods.today.input).toBe(3);
  const scoped = await cli.mesa('usage', '--session', first, '--json');
  expect(scoped.code).toBe(0);
  expect(scoped.json.data).toMatchObject({
    rows: [{ session: first, source: 'claude-transcript', tokens: { input: 3, output: 2 } }],
    unknown: [],
    periods: { today: { input: 3, output: 2 } },
  });
  expect((await cli.mesa('usage', '--session', 'zzzzzzzz', '--json')).json.data).toMatchObject({
    rows: [],
    periods: { today: { input: 0, output: 0 } },
  });
});
