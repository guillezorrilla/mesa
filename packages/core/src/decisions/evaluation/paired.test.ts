import { expect, test } from 'vitest';
import { PAIRED_GATE, type PairedRun, pairedArm, pairedVerdict } from './paired.js';

// The paired gate on invented runs: six tasks, two repetitions per arm.

const TASKS = ['t1', 't2', 't3', 't4', 't5', 't6'];

/** Twelve runs of `arm`: the first `successes` succeed; each takes `wallMs`. */
const arm = (name: string, successes: number, wallMs: number): PairedRun[] =>
  TASKS.flatMap((task, i) =>
    [1, 2].map((rep) => ({
      arm: name,
      task,
      rep,
      success: i * 2 + rep - 1 < successes,
      wallMs,
    })),
  );

test('time per successful task is total wall time over successes, unbounded with none', () => {
  expect(pairedArm(arm('off', 4, 10_000))).toEqual({
    runs: 12,
    successes: 4,
    wallMs: 120_000,
    msPerSuccess: 30_000,
  });
  expect(pairedArm(arm('off', 0, 10_000)).msPerSuccess).toBeNull();
  expect(PAIRED_GATE).toMatchObject({ tasks: 6, repetitions: 2, slower: 0.1, faster: 0.1 });
});

test('more successes at a higher raw time pass: the pilot shape (0/12 to 10/12)', () => {
  const verdict = pairedVerdict([...arm('off', 0, 10_600), ...arm('jev', 10, 15_900)], 'jev');
  expect(verdict).toMatchObject({ pass: true, reason: 'passed', timeChange: null });
  expect(verdict.checks).toMatchObject({ moreSuccesses: true, faster: true, timeNotWorse: true });
});

test('the same successes pass only when time per success is at least 10% lower', () => {
  const off = arm('off', 6, 20_000);
  expect(pairedVerdict([...off, ...arm('clef', 6, 18_000)], 'clef')).toMatchObject({
    pass: true,
    timeChange: expect.closeTo(-0.1, 9),
  });
  expect(pairedVerdict([...off, ...arm('clef', 6, 19_000)], 'clef')).toMatchObject({
    pass: false,
    reason: 'no improvement: neither +1 success nor 10% less time per successful task',
  });
});

test('fewer successes, or more than 10% slower per success, fail whatever else improved', () => {
  const off = arm('off', 8, 10_000);
  expect(pairedVerdict([...off, ...arm('jev', 7, 5_000)], 'jev')).toMatchObject({
    pass: false,
    reason: 'fewer successes (7 against 8)',
  });
  // One more success, but 150,000 ms over 9 against 120,000 ms over 8: 11% slower per success.
  const slower = pairedVerdict([...off, ...arm('jev', 9, 12_500)], 'jev');
  expect(slower.on.msPerSuccess).toBeCloseTo(16_666.67, 1);
  expect(slower.off.msPerSuccess).toBe(15_000);
  expect(slower).toMatchObject({
    pass: false,
    reason: 'time per successful task more than 10% worse',
  });
  // Nothing solved with assistance while something was without: unbounded is worse.
  expect(pairedVerdict([...arm('off', 1, 1_000), ...arm('jev', 0, 1_000)], 'jev').pass).toBe(false);
  // Nothing solved in either arm: no improvement.
  expect(pairedVerdict([...arm('off', 0, 1_000), ...arm('jev', 0, 1_000)], 'jev').reason).toBe(
    'no improvement: neither +1 success nor 10% less time per successful task',
  );
});

test('fewer than 6 tasks, a missing repetition, or different tasks give no verdict', () => {
  const off = arm('off', 0, 10_000);
  const on = arm('jev', 12, 10_000);
  const incomplete = /^incomplete/;
  expect(pairedVerdict([...off, ...on.slice(1)], 'jev').reason).toMatch(incomplete);
  expect(
    pairedVerdict(
      [...off, ...on].filter((r) => r.task !== 't6'),
      'jev',
    ).reason,
  ).toMatch(incomplete);
  expect(
    pairedVerdict([...off, ...on.map((r) => (r.task === 't6' ? { ...r, task: 't7' } : r))], 'jev')
      .reason,
  ).toMatch(incomplete);
  expect(pairedVerdict([...off, ...on], 'jev').pass).toBe(true);
});
