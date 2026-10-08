import { PAIRED_PASSED } from './measured.js';
import { DECISION_SITES, type DecisionSite, PASSED_GATE } from './sites.js';
import type { SystemOneProvider } from './systemone.js';
import type { DecisionsModel } from './types.js';

// How a model runs each decision site (ADR-0019 and its 2026-10-07 amendment): the one rule that
// Settings, the session details, `mesa decisions status`, evaluate and the Board's supervision read.

/** Off, on demand only, or automatic (proven, or opted in as experimental). */
export type SiteMode = 'off' | 'on-demand' | 'automatic';

/** The two gates' verdicts per model: the real ones unless a test's. */
export type SiteGates = {
  passed: Record<SystemOneProvider, readonly DecisionSite[]>;
  paired: Record<SystemOneProvider, readonly DecisionSite[]>;
};
const GATES: SiteGates = { passed: PASSED_GATE, paired: PAIRED_PASSED };

/**
 * How `model` runs `site`: automatic where it passed both the quality gate (PASSED_GATE) and the
 * paired workflows (PAIRED_PASSED); with `experimental` (the person's opt-in,
 * `decisions.experimental`) also automatic, marked experimental, at any other site that passed
 * the quality gate. Otherwise Board supervision, which has no on-demand call, is off and the rest
 * run on demand, marked experimental where they missed the quality gate. No model: off.
 */
export function siteMode(
  model: DecisionsModel,
  site: DecisionSite,
  experimental: boolean,
  gates: SiteGates = GATES,
): { mode: SiteMode; experimental: boolean } {
  if (model === 'none') return { mode: 'off', experimental: false };
  const passed = gates.passed[model].includes(site);
  if (passed && gates.paired[model].includes(site))
    return { mode: 'automatic', experimental: false };
  if (passed && experimental) return { mode: 'automatic', experimental: true };
  if (site === 'supervision') return { mode: 'off', experimental: false };
  return { mode: 'on-demand', experimental: !passed };
}

/** The sites each model runs automatically, as the supervision gate reads it. */
export const automaticGate = (
  experimental: boolean,
): Record<SystemOneProvider, readonly DecisionSite[]> => {
  const automatic = (model: SystemOneProvider) =>
    DECISION_SITES.filter((site) => siteMode(model, site, experimental).mode === 'automatic');
  return { jev: automatic('jev'), clef: automatic('clef') };
};
