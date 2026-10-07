import type { PairedArm } from './evaluation/paired.js';
import type { DecisionSite } from './sites.js';
import type { SystemOneProvider } from './systemone.js';

// What ADR-0019's evaluations measured per model and site, shown beside each site's mode in
// Settings, the session details and `mesa decisions status`: held-out quality (#638) and the paired
// workflows (#465). The verdicts they back are sites.ts's PASSED_GATE and PAIRED_PASSED.

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

/**
 * Each model's paired-workflow result at the sites its automatic advice ran at (only relevance is
 * delivered automatically inside a session); a site with none is not measured. The lead fills it
 * from `pnpm decisions:paired` (docs/spikes/decision-assistance-evaluation.md).
 */
// Seed 1476997429, 2026-10-07: 6 tasks x 2 repetitions per arm, sonnet, Claude Code 2.1.292.
const OFF = { runs: 12, successes: 0, wallMs: 291953, msPerSuccess: null };
const PAIRED: Record<SystemOneProvider, Partial<Record<DecisionSite, PairedMeasure>>> = {
  jev: {
    relevance: {
      on: { runs: 12, successes: 12, wallMs: 221389, msPerSuccess: 18449.083333333332 },
      off: OFF,
      pass: true,
    },
  },
  clef: {
    relevance: {
      on: { runs: 12, successes: 12, wallMs: 221507, msPerSuccess: 18458.916666666668 },
      off: OFF,
      pass: true,
    },
  },
};

export const siteMeasure = (model: SystemOneProvider, site: DecisionSite): SiteMeasure => {
  const paired = PAIRED[model][site];
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
