import { armsVerdict, armTotals, type PairedArm } from './evaluation/paired.js';
import { DECISION_SITES, type DecisionSite } from './sites.js';
import type { SystemOneProvider } from './systemone.js';

// What ADR-0019's evaluations measured per model and site, shown beside each site's mode in
// Settings, the session details and `mesa decisions status`: held-out quality (#638) and the paired
// workflows (#465). The quality verdicts are sites.ts's PASSED_GATE; the paired verdicts are read
// from the arms here (PAIRED_PASSED).

/** Held-out cases, how many Mesa accepted, and how many of those were right. */
export type QualityMeasure = { n: number; accepted: number; right: number };
/** A paired-workflow result: the arm with the model's automatic advice, the arm without, the gate. */
export type PairedMeasure = { on: PairedArm; off: PairedArm; pass: boolean };
export type SiteMeasure = { quality: QualityMeasure; paired?: PairedMeasure };

const held = (accepted: number, right = accepted): QualityMeasure => ({ n: 30, accepted, right });

/** jev-1.13.0 and clef (27B) on the held-out split, 2026-10-05 (docs/spikes/jev-clef-qualification.md). */
const QUALITY: Record<SystemOneProvider, Record<DecisionSite, QualityMeasure>> = {
  jev: { supervision: held(26), relevance: held(28), 'next-step': held(29), evidence: held(26) },
  clef: {
    supervision: held(30),
    relevance: held(27),
    'next-step': held(29),
    evidence: held(26, 25),
  },
};

/** An arm as measured: its runs, successes and total wall time. */
type MeasuredArm = Omit<PairedArm, 'msPerSuccess'>;

/**
 * Each model's paired-workflow arms at the sites its automatic advice ran at (only relevance is
 * delivered automatically inside a session); a site with none is not measured. Filled from the
 * measured run of `pnpm decisions:paired` (docs/spikes/decision-assistance-evaluation.md).
 */
// Seed 1476997429, 2026-10-07: 6 tasks x 2 repetitions per arm, sonnet, Claude Code 2.1.292.
const OFF: MeasuredArm = { runs: 12, successes: 0, wallMs: 291953 };
const PAIRED_ARMS: Record<
  SystemOneProvider,
  Partial<Record<DecisionSite, { on: MeasuredArm; off: MeasuredArm }>>
> = {
  jev: { relevance: { on: { runs: 12, successes: 12, wallMs: 221389 }, off: OFF } },
  clef: { relevance: { on: { runs: 12, successes: 12, wallMs: 221507 }, off: OFF } },
};

/** A model's paired result at `site`, its verdict read by the frozen gate (armsVerdict). */
function pairedMeasure(model: SystemOneProvider, site: DecisionSite): PairedMeasure | undefined {
  const arms = PAIRED_ARMS[model][site];
  if (!arms) return undefined;
  const on = armTotals(arms.on);
  const off = armTotals(arms.off);
  return { on, off, pass: armsVerdict(on, off).pass };
}

const pairedPassed = (model: SystemOneProvider) =>
  DECISION_SITES.filter((site) => pairedMeasure(model, site)?.pass);

/**
 * The sites where each model passed ADR-0019's frozen paired-workflow gate (#465): paired coding
 * runs with its automatic advice on solved at least as many tasks, no more than 10% slower per
 * solved task, and better on one of the two (`evaluation/paired.ts`). The gates are never lowered
 * to fill it.
 */
export const PAIRED_PASSED: Record<SystemOneProvider, readonly DecisionSite[]> = {
  jev: pairedPassed('jev'),
  clef: pairedPassed('clef'),
};

export const siteMeasure = (model: SystemOneProvider, site: DecisionSite): SiteMeasure => {
  const paired = pairedMeasure(model, site);
  return { quality: QUALITY[model][site], ...(paired ? { paired } : {}) };
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const seconds = (ms: number | null) => (ms === null ? 'unbounded' : `${Math.round(ms / 1000)} s`);

/** A measure in one line, as every surface shows it. */
export function measuredText({ quality: q, paired: p }: SiteMeasure): string {
  const quality = `Quality: ${pct(q.right / q.accepted)} right where it answered, on ${pct(q.accepted / q.n)} of ${q.n} held-out cases.`;
  const paired = p
    ? `Paired workflows: ${p.on.successes} of ${p.on.runs} tasks solved against ${p.off.successes} of ${p.off.runs} without, ${seconds(p.on.msPerSuccess)} against ${seconds(p.off.msPerSuccess)} per solved task (${p.pass ? 'passed' : 'failed'}).`
    : 'Paired workflows: not measured.';
  return `${quality} ${paired}`;
}
