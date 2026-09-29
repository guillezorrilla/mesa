import { appendFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import { profilePaths } from '../profile/paths.js';
import {
  codexWorld,
  fixedClock,
  newSession,
  plantTranscript,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';

const at = '2026-09-24T12:01:00.000Z';

test('Claude repeated message updates count once, survive removal, and stay in their profile', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const record = testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  const message = (output: number) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      message: {
        id: 'msg_lantern',
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 20,
          output_tokens: output,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
          cache_creation: {
            ephemeral_5m_input_tokens: 5,
            ephemeral_1h_input_tokens: 0,
          },
        },
      },
    });
  plantTranscript(home, nativeId, dir, [message(2), message(3)].join('\n'));

  const first = await mesa.usage.list();
  expect(first.rows).toMatchObject([
    {
      session: record.id,
      agent: 'claude',
      tokens: {
        input: 20,
        output: 3,
        cacheRead: 10,
        cacheWrite: 5,
        cacheWrite5m: 5,
        cacheWrite1h: 0,
      },
      priceVersion: 'claude-opus-5-5:2026-09-28:standard-api',
      estimatedCostUsd: 0.000167,
    },
  ]);
  expect((await mesa.usage.list()).rows).toEqual(first.rows);
  expect(first.periods.today).toMatchObject({
    events: 1,
    input: 20,
    output: 3,
    estimatedCostUsd: 0.000167,
  });
  expect(first.daily.at(-1)).toMatchObject({ day: '2026-09-24', totals: { events: 1 } });
  expect(first.breakdown).toMatchObject([
    { agent: 'claude', model: 'claude-opus-5-5', totals: { events: 1 } },
  ]);
  const config = profilePaths(home, 'default').config;
  setConfigValue(config, 'usage.dailyAlertUsd', '0.0001');
  setConfigValue(config, 'usage.weeklyAlertUsd', '0.0002');
  setConfigValue(config, 'usage.monthlyAlertUsd', '0.0001');
  expect((await mesa.usage.list()).alerts).toEqual([
    { period: 'today', thresholdUsd: 0.0001, knownCostUsd: 0.000167 },
    { period: 'month', thresholdUsd: 0.0001, knownCostUsd: 0.000167 },
  ]);
  expect((await mesa.usage.list(record.id)).alerts).toEqual([]);
  testStore(home).remove(record.id);
  expect((await mesa.usage.list()).rows).toEqual(first.rows);
  expect((await createMesa('other', testDeps(home)).usage.list()).rows).toEqual([]);
});

test('Codex cumulative totals contribute only positive deltas, not repeated compaction totals', async () => {
  const codex = codexWorld();
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    env: codex.env,
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  const record = testStore(home).create(() =>
    newSession({ agent: 'codex', agentSessionId: nativeId }),
  );
  const rollout = codex.rollout({ id: nativeId, cwd: dir, startedAt: '2026-09-24T12:00:00.000Z' });
  const total = (timestamp: string, input: number, output: number, cached: number) =>
    JSON.stringify({
      type: 'event_msg',
      timestamp,
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: input,
            output_tokens: output,
            cached_input_tokens: cached,
            cache_write_input_tokens: 0,
          },
        },
      },
    });
  appendFileSync(
    rollout,
    [
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-6-sol' } }),
      total(at, 100, 20, 40),
      total('2026-09-24T12:02:00.000Z', 100, 20, 40),
      total('2026-09-24T12:03:00.000Z', 150, 30, 60),
    ]
      .map((line) => `\n${line}`)
      .join(''),
  );

  const result = await mesa.usage.list(record.id);
  expect(result.rows.map((row) => row.tokens)).toEqual([
    { input: 60, output: 20, cacheRead: 40, cacheWrite: 0, cacheWrite5m: null, cacheWrite1h: null },
    { input: 30, output: 10, cacheRead: 20, cacheWrite: 0, cacheWrite5m: null, cacheWrite1h: null },
  ]);
  expect(result.rows.map((row) => row.model)).toEqual(['gpt-6-sol', 'gpt-6-sol']);
  expect((await mesa.usage.list(record.id)).rows).toEqual(result.rows);
});
