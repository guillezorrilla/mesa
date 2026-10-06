import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import { profilePaths } from '../profile/paths.js';
import { recordHookEvent } from '../sessions/signals/hook-events.js';
import {
  codexWorld,
  fixedClock,
  lockDeps,
  newSession,
  plantTranscript,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';
import type { UsageRecord } from './records.js';
import { summarizeUsage } from './summary.js';

const at = '2026-09-24T12:01:00.000Z';

test('Claude repeated message updates count once, survive removal, and stay in their profile', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const store = testStore(home);
  const record = store.create(() => newSession({ agentSessionId: nativeId }));
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
  expect(first.daily.at(-1)).toMatchObject({
    day: '2026-09-24',
    totals: { events: 1 },
    models: [{ agent: 'claude', model: 'claude-opus-5-5', totals: { events: 1, input: 20 } }],
  });
  expect(first.daily.at(-2)?.models).toEqual([]);
  expect(first.breakdown).toMatchObject([
    { agent: 'claude', model: 'claude-opus-5-5', totals: { events: 1 } },
  ]);
  expect(first.agents).toMatchObject([
    { agent: 'claude', totals: { events: 1, estimatedCostUsd: 0.000167 } },
  ]);
  const config = profilePaths(home, 'default').config;
  setConfigValue(config, 'usage.dailyAlertUsd', '0.0001', lockDeps());
  setConfigValue(config, 'usage.weeklyAlertUsd', '0.0002', lockDeps());
  setConfigValue(config, 'usage.monthlyAlertUsd', '0.0001', lockDeps());
  expect((await mesa.usage.list()).alerts).toEqual([
    { period: 'today', thresholdUsd: 0.0001, knownCostUsd: 0.000167 },
    { period: 'month', thresholdUsd: 0.0001, knownCostUsd: 0.000167 },
  ]);
  expect((await mesa.usage.list(record.id)).alerts).toEqual([]);
  store.create(() => newSession({ agent: 'codex' }));
  const incomplete = await mesa.usage.list();
  expect(incomplete.unknown).toHaveLength(1);
  expect(incomplete.periods.today).toMatchObject({ input: null, estimatedCostUsd: null });
  expect(incomplete.daily.at(-1)?.totals.estimatedCostUsd).toBeNull();
  expect(incomplete.alerts).toContainEqual({
    period: 'today',
    thresholdUsd: 0.0001,
    knownCostUsd: 0.000167,
  });
  store.remove(record.id);
  expect((await mesa.usage.list()).rows).toEqual(first.rows);
  expect((await createMesa('other', testDeps(home)).usage.list()).rows).toEqual([]);
});

test('usage preserves older ledgers and refreshes only when a native file changes', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  const message = (id: string, output: number) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      message: {
        id,
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 1,
          output_tokens: output,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
  plantTranscript(home, nativeId, dir, message('first', 2));
  const first = await mesa.usage.list();
  const ledger = profilePaths(home, 'default').usage;
  writeFileSync(ledger, JSON.stringify(first.rows));
  expect((await createMesa('default', testDeps(home)).usage.list()).rows).toEqual(first.rows);
  expect(Object.keys(JSON.parse(readFileSync(ledger, 'utf8')).sources)).toHaveLength(1);
  const transcript = transcriptFile(claudeTranscripts(home, {}), nativeId);
  if (!transcript) throw new Error('missing invented transcript');
  appendFileSync(transcript, `\n${message('second', 4)}`);
  expect((await mesa.usage.list()).periods.today.output).toBe(6);
});

test('an unreadable native usage source stays unknown', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const record = testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  plantTranscript(home, nativeId, dir);
  const file = transcriptFile(claudeTranscripts(home, {}), nativeId);
  if (!file) throw new Error('missing invented transcript');
  unlinkSync(file);
  mkdirSync(file);
  const report = await mesa.usage.list();
  expect(report.unknown).toEqual([
    { session: record.id, reason: 'native usage file could not be read' },
  ]);
  expect(report.periods.today.estimatedCostUsd).toBeNull();
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
  const hook = (id: string, event: string, source?: string) =>
    recordHookEvent(
      {
        store: testStore(home),
        eventsDir: profilePaths(home, 'default').events,
        clock: fixedClock('2026-09-24T12:05:00.000Z'),
        home,
        secrets: () => [],
      },
      {
        agent: 'codex',
        mesaSessionId: record.id,
        payload: JSON.stringify({ session_id: id, hook_event_name: event, source }),
      },
    );
  const secondId = '01a0e14e-be41-72f1-a81b-e25d2198602b';
  const thirdId = '01a0e14e-be41-72f1-a81b-e25d2198602c';
  hook(nativeId, 'SessionEnd');
  hook(secondId, 'SessionStart', 'clear');
  const afterClear = await mesa.usage.list(record.id);
  expect(afterClear.rows).toEqual(result.rows);
  expect(afterClear.unknown).toContainEqual({
    session: record.id,
    reason: 'native session identity changed',
  });
  expect(afterClear.periods.today.estimatedCostUsd).toBeNull();
  expect(
    (await createMesa('default', testDeps(home, { env: codex.env })).usage.list(record.id)).unknown,
  ).toContainEqual({ session: record.id, reason: 'native session identity changed' });
  testStore(home).update(record.id, { agentSessionId: secondId });
  appendFileSync(
    codex.rollout({ id: secondId, cwd: dir, startedAt: '2026-09-24T12:05:00.000Z' }),
    `\n${total('2026-09-24T12:06:00.000Z', 10, 2, 0)}`,
  );
  expect((await mesa.usage.list(record.id)).unknown).toEqual([]);
  hook(secondId, 'SessionEnd');
  hook(thirdId, 'SessionStart', 'clear');
  expect((await mesa.usage.list(record.id)).unknown).toContainEqual({
    session: record.id,
    reason: 'native session identity changed',
  });
  testStore(home).update(record.id, { agentSessionId: thirdId });
  appendFileSync(
    codex.rollout({ id: thirdId, cwd: dir, startedAt: '2026-09-24T12:07:00.000Z' }),
    `\n${total('2026-09-24T12:08:00.000Z', 8, 1, 0)}`,
  );
  const adopted = await mesa.usage.list(record.id);
  expect(adopted.unknown).toEqual([]);
  expect(new Set(adopted.rows.map((row) => row.nativeSessionId))).toEqual(
    new Set([nativeId, secondId, thirdId]),
  );
});

test('Claude subagent spend counts: sidechain lines and subagents/ transcripts, each message once', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  const message = (id: string, output: number, sidechain = false) =>
    JSON.stringify({
      type: 'assistant',
      ...(sidechain ? { isSidechain: true, agentId: 'a1' } : {}),
      timestamp: at,
      message: {
        id,
        model: 'claude-opus-5-5',
        usage: {
          input_tokens: 1,
          output_tokens: output,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
  // The parent's own reply, and a subagent's reply that an older Claude Code kept inline.
  plantTranscript(
    home,
    nativeId,
    dir,
    [message('msg_parent', 2), message('msg_inline', 3, true)].join('\n'),
  );
  expect((await mesa.usage.list()).periods.today).toMatchObject({ events: 2, output: 5 });

  // A ledger an earlier reader stamped, without the sidechain reply, is read again.
  const ledger = profilePaths(home, 'default').usage;
  const saved = JSON.parse(readFileSync(ledger, 'utf8')) as {
    rows: UsageRecord[];
    sources: Record<string, object>;
  };
  writeFileSync(
    ledger,
    JSON.stringify({
      ...saved,
      rows: saved.rows.filter((row) => row.id.endsWith(':msg_parent')),
      sources: Object.fromEntries(
        Object.entries(saved.sources).map(([key, source]) => [key, { ...source, reader: 1 }]),
      ),
    }),
  );
  expect((await mesa.usage.list()).periods.today).toMatchObject({ events: 2, output: 5 });

  const transcript = transcriptFile(claudeTranscripts(home, {}), nativeId);
  if (!transcript) throw new Error('missing invented transcript');
  const subagents = join(transcript.slice(0, -'.jsonl'.length), 'subagents');
  mkdirSync(subagents, { recursive: true });
  const subagent = join(subagents, 'agent-a1.jsonl');
  // The subagent's own transcript repeats the inline reply and streams an update of its next one.
  writeFileSync(
    subagent,
    [
      message('msg_inline', 3, true),
      message('msg_scout', 4, true),
      message('msg_scout', 5, true),
    ].join('\n'),
  );
  expect((await mesa.usage.list()).periods.today).toMatchObject({
    events: 3,
    output: 10,
    estimatedCostUsd: expect.any(Number),
  });
  // A subagent that goes on after the parent's transcript last changed still refreshes the ledger.
  appendFileSync(subagent, `\n${message('msg_late', 6, true)}`);
  expect((await mesa.usage.list()).periods.today).toMatchObject({ events: 4, output: 16 });
});

test('current Claude models have list prices; an unknown model stays unknown, not free', async () => {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(run, {
    clock: fixedClock('2026-09-24T12:10:00.000Z'),
  });
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  const message = (id: string, model: string) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      message: {
        id,
        model,
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          cache_read_input_tokens: 10_000,
          cache_creation_input_tokens: 300,
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 },
        },
      },
    });
  plantTranscript(
    home,
    nativeId,
    dir,
    [
      message('msg_sonnet', 'claude-sonnet-5-5'),
      message('msg_haiku', 'claude-haiku-4-5-20251001'),
      message('msg_fable', 'claude-fable-5-1'),
    ].join('\n'),
  );
  const priced = await mesa.usage.list();
  const byModel = Object.fromEntries(priced.rows.map((row) => [row.model, row]));
  expect(byModel['claude-sonnet-5-5']?.priceVersion).toBe(
    'claude-sonnet-5-5:2026-09-25:standard-api',
  );
  // Per million: input, output, cache read, then 5-minute (1.25x input) and 1-hour (2x) writes.
  expect(byModel['claude-sonnet-5-5']?.estimatedCostUsd).toBeCloseTo(
    (1000 * 2 + 100 * 10 + 10_000 * 0.2 + 200 * 2.5 + 100 * 4) / 1_000_000,
    12,
  );
  expect(byModel['claude-haiku-4-5-20251001']?.estimatedCostUsd).toBeCloseTo(
    (1000 * 1 + 100 * 5 + 10_000 * 0.1 + 200 * 1.25 + 100 * 2) / 1_000_000,
    12,
  );
  expect(byModel['claude-fable-5-1']?.estimatedCostUsd).toBeCloseTo(
    (1000 * 10 + 100 * 50 + 10_000 * 0.25 + 200 * 12.5 + 100 * 20) / 1_000_000,
    12,
  );
  expect(priced.periods.today.estimatedCostUsd).toBeCloseTo(0.0059 + 0.00295 + 0.022, 12);
  expect(priced.daily.at(-1)?.totals.estimatedCostUsd).not.toBeNull();

  const transcript = transcriptFile(claudeTranscripts(home, {}), nativeId);
  if (!transcript) throw new Error('missing invented transcript');
  appendFileSync(transcript, `\n${message('msg_unknown', 'claude-lantern-9')}`);
  const unknown = await mesa.usage.list();
  expect(unknown.rows.find((row) => row.model === 'claude-lantern-9')).toMatchObject({
    priceVersion: null,
    estimatedCostUsd: null,
  });
  expect(unknown.periods.today.estimatedCostUsd).toBeNull();
});

test('a long history summarizes without copying its buckets per row', () => {
  const row: UsageRecord = {
    id: '',
    session: 'lantern1',
    agent: 'claude',
    nativeSessionId: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f',
    model: 'claude-opus-5-5',
    at,
    source: 'claude-transcript',
    tokens: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
    },
    priceVersion: 'claude-opus-5-5:2026-09-28:standard-api',
    estimatedCostUsd: 0.000024,
  };
  const rows = Array.from({ length: 45_000 }, (_, index) => ({ ...row, id: `claude:x:${index}` }));
  const started = performance.now();
  const summary = summarizeUsage(rows, new Date('2026-09-24T12:10:00.000Z'));
  // Copying the day's and the model's bucket on every row took seconds at this size.
  expect(performance.now() - started).toBeLessThan(1000);
  expect(summary.daily.at(-1)?.totals.events).toBe(45_000);
  expect(summary.breakdown).toMatchObject([
    { model: 'claude-opus-5-5', totals: { events: 45_000 } },
  ]);
});
