// ADR-0019's paired-workflow gate (#465, the owner's 2026-10-03 revision): the same invented coding
// tasks run with a model's automatic advice and without it, and assistance passes only if it
// solves at least as many and is no more than 10% slower per solved task, and better on one of
// the two. Faster answers or more decision calls alone never count.

/** The gate, frozen before any paired run. */
export const PAIRED_GATE = {
  /** At least this many distinct tasks, each run this many times in every arm. */
  tasks: 6,
  repetitions: 2,
  /** Time per successful task with assistance may be at most this share worse. */
  slower: 0.1,
  /** An improvement: at least this many more successes, or this share less time per success. */
  moreSuccesses: 1,
  faster: 0.1,
} as const;

/** One run: its arm (`off`, `jev`, `clef`), task and repetition, whether its hidden test passed. */
export type PairedRun = {
  arm: string;
  task: string;
  rep: number;
  success: boolean;
  wallMs: number;
};

/**
 * An arm's totals. Time per successful task is the arm's total wall time over its successes:
 * null, unbounded, when none succeeded.
 */
export type PairedArm = {
  runs: number;
  successes: number;
  wallMs: number;
  msPerSuccess: number | null;
};

/** An arm's counts with its time per successful task. */
export const armTotals = (arm: Omit<PairedArm, 'msPerSuccess'>): PairedArm => ({
  ...arm,
  msPerSuccess: arm.successes ? arm.wallMs / arm.successes : null,
});

export function pairedArm(runs: readonly PairedRun[]): PairedArm {
  return armTotals({
    runs: runs.length,
    successes: runs.filter((r) => r.success).length,
    wallMs: runs.reduce((sum, r) => sum + r.wallMs, 0),
  });
}

/** Each task's run count in `runs`. */
const perTask = (runs: readonly PairedRun[]) => {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.task, (counts.get(r.task) ?? 0) + 1);
  return counts;
};

/**
 * Whether both arms ran the same tasks, at least PAIRED_GATE.tasks of them, each at least
 * PAIRED_GATE.repetitions times in each arm: anything less is no verdict.
 */
function complete(on: readonly PairedRun[], off: readonly PairedRun[]) {
  const a = perTask(on);
  const b = perTask(off);
  return (
    a.size >= PAIRED_GATE.tasks &&
    a.size === b.size &&
    [...a].every(
      ([task, n]) => n >= PAIRED_GATE.repetitions && (b.get(task) ?? 0) >= PAIRED_GATE.repetitions,
    )
  );
}

/**
 * Arm `on` (assistance) against `off` by the gate's comparisons, the runs already complete: success
 * not lower, time per success at most 10% worse (an unbounded time is worse than any bounded one,
 * and equal to another unbounded one), and at least one improvement. `reason` is the first that
 * fails. A measured result kept without its runs (`measured.ts`) is read this way.
 */
export function armsVerdict(on: PairedArm, off: PairedArm) {
  const time = (a: PairedArm) => a.msPerSuccess ?? Number.POSITIVE_INFINITY;
  const checks = {
    successNotLower: on.successes >= off.successes,
    timeNotWorse: time(on) <= time(off) * (1 + PAIRED_GATE.slower),
    moreSuccesses: on.successes >= off.successes + PAIRED_GATE.moreSuccesses,
    faster: on.msPerSuccess !== null && time(on) <= time(off) * (1 - PAIRED_GATE.faster),
  };
  const reason = !checks.successNotLower
    ? `fewer successes (${on.successes} against ${off.successes})`
    : !checks.timeNotWorse
      ? 'time per successful task more than 10% worse'
      : !(checks.moreSuccesses || checks.faster)
        ? 'no improvement: neither +1 success nor 10% less time per successful task'
        : undefined;
  return { pass: reason === undefined, reason: reason ?? 'passed', checks };
}

/**
 * `arm` against `baseline` (assistance off) over `runs`, by the gate: complete, then armsVerdict.
 * `reason` is the first that fails.
 */
export function pairedVerdict(runs: readonly PairedRun[], arm: string, baseline = 'off') {
  const mine = runs.filter((r) => r.arm === arm);
  const theirs = runs.filter((r) => r.arm === baseline);
  const on = pairedArm(mine);
  const off = pairedArm(theirs);
  const compared = armsVerdict(on, off);
  const done = complete(mine, theirs);
  const reason = done
    ? compared.reason
    : `incomplete: at least ${PAIRED_GATE.tasks} tasks, ${PAIRED_GATE.repetitions} runs each, in both arms`;
  return {
    arm,
    baseline,
    pass: done && compared.pass,
    reason,
    checks: { complete: done, ...compared.checks },
    on,
    off,
    /** Time per success with assistance over without, minus 1; null when either is unbounded. */
    timeChange:
      on.msPerSuccess === null || off.msPerSuccess === null
        ? null
        : on.msPerSuccess / off.msPerSuccess - 1,
  };
}
export type PairedVerdict = ReturnType<typeof pairedVerdict>;
