import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lockDeps } from '../testing/lock.js';
import { tempDir } from '../testing/tmp.js';
import { prVerdicts, withVerdicts } from './verdicts.js';

test("each thread's latest verdict wins, per PR, in the profile's prs folder", () => {
  const dir = join(tempDir(), 'prs');
  const verdicts = prVerdicts(dir, lockDeps());
  const at = '2026-10-14T10:00:00.000Z';
  verdicts.record('lantern-cove', 12, { thread: 'T1', state: 'not', round: 2, at });
  verdicts.record('lantern-cove', 12, { thread: 'T2', state: 'addressed', round: 2, at });
  verdicts.record('lantern-cove', 12, {
    thread: 'T1',
    state: 'partly',
    note: 'renames still miss',
    confidence: 0.7,
    round: 3,
    at,
  });
  verdicts.record('lantern-cove', 13, { thread: 'T1', state: 'addressed', round: 2, at });

  const latest = verdicts.latest('lantern-cove', 12);
  expect(latest.get('T1')).toMatchObject({ state: 'partly', round: 3, confidence: 0.7 });
  expect(latest.get('T2')).toMatchObject({ state: 'addressed', round: 2 });
  expect(verdicts.latest('lantern-cove', 14).size).toBe(0);
  expect(() =>
    verdicts.record('lantern-cove', 12, {
      thread: 'T3',
      state: 'addressed',
      confidence: 2,
      round: 2,
      at,
    }),
  ).toThrow();
});

test('withVerdicts gives each thread its latest verdict as show carries it, leaving the rest', () => {
  const dir = join(tempDir(), 'prs');
  const verdicts = prVerdicts(dir, lockDeps());
  const at = '2026-10-14T10:00:00.000Z';
  verdicts.record('lantern-cove', 12, { thread: 'T1', state: 'not', round: 2, at });
  verdicts.record('lantern-cove', 12, {
    thread: 'T1',
    state: 'addressed',
    note: 'fixed',
    round: 3,
    at,
  });
  const threads = [
    { id: 'T1', body: 'Round once' },
    { id: 'T2', body: 'Name it' },
  ];
  expect(withVerdicts(threads, verdicts.latest('lantern-cove', 12))).toEqual([
    { id: 'T1', body: 'Round once', verdict: { state: 'addressed', note: 'fixed', round: 3 } },
    { id: 'T2', body: 'Name it' },
  ]);
});
