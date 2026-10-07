import { z } from 'zod';
import { AGENT_STATES } from '../../agents/states.js';
import type { Clock } from '../../lib/clock.js';
import { classify } from '../../sessions/signals/state.js';
import { checked } from '../decide.js';
import { rulesBackend, type Weights } from '../rules.js';
import {
  type AcceptAt,
  accepted,
  DECISION_SITES,
  type DecisionSite,
  margin,
  siteQuestion,
} from '../sites.js';
import type { Answer, Question } from '../types.js';
import type { EvalCase } from './corpus.js';

// Scores a decisions backend on the corpus (ADR-0019), per site: accuracy where Mesa accepts the
// answer, how often it accepts, calibration and latency, against gates frozen before testing.

/**
 * Anything that answers Faro's questions about a case's `state` text: its answers, or (as the
 * System One backend does) the answers with the model id, input tokens and list price.
 */
export type EvalBackend = {
  name: string;
  answer: (state: string, questions: Question[]) => Promise<unknown>;
};

/** A model under test: its backend and the thresholds its answers are accepted at. */
export type EvalModel = { backend: EvalBackend; acceptAt: AcceptAt };

const Reply = z.union([
  z.array(z.unknown()),
  z.object({
    answers: z.array(z.unknown()),
    model: z.string().optional(),
    inputTokens: z.number().optional(),
    costUsd: z.number().optional(),
  }),
]);

/**
 * The rules baseline (ADR-0019): what Mesa decides with no model. Supervision reads the screen as
 * the board does with no hook or listing (`classify`, its tail at 0.6); the other sites have no
 * rules, so their answers are even and always abstain.
 */
export function rulesBaseline(c: EvalCase): EvalBackend {
  const weights = (): Record<string, Weights> => {
    if (c.site !== 'supervision' || !c.agent) return {};
    const now = '2026-10-03T12:00:00.000Z';
    const unknown = { state: 'working' as const, confidence: 0, source: 'tmux' as const, at: now };
    const seen = classify({
      now,
      agent: c.agent,
      last: unknown,
      ended: false,
      tail: c.state,
      priority: 0,
    });
    if (seen === unknown) return {};
    const rest = (1 - seen.confidence) / (AGENT_STATES.length - 1);
    return {
      state: Object.fromEntries(
        AGENT_STATES.map((s) => [s, s === seen.state ? seen.confidence : rest]),
      ),
    };
  };
  const rules = rulesBackend<string>([{ when: () => true, answer: weights }]);
  return { name: 'rules', answer: (state, questions) => rules.answer(state, questions) };
}

/** One case's outcome: its answer, or why the backend gave none. */
export type CaseResult = {
  id: string;
  site: DecisionSite;
  tags: readonly string[];
  options: number;
  expected: string | boolean;
  latencyMs: number;
} & (
  | {
      answer: string | boolean;
      p: number;
      margin: number;
      accepted: boolean;
      correct: boolean;
      model?: string;
      inputTokens?: number;
      costUsd?: number;
    }
  | { unavailable: string }
);

const top = (a: Answer) =>
  a.kind === 'Noul'
    ? { answer: a.answer, p: Math.max(a.probabilities, 1 - a.probabilities) }
    : {
        answer: a.kind === 'Choice' ? a.answer : String(a.answer),
        p: Math.max(...Object.values(a.probabilities)),
      };

/**
 * Runs every case through `model` one at a time, in order; its answer is accepted at its site's
 * threshold. Without a model, the rules baseline: its answer stands whenever it is not even, as
 * the board acts on the rules today.
 */
export async function runCases(
  deps: { model?: EvalModel; clock: Clock },
  cases: readonly EvalCase[],
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const question = siteQuestion(c.site, c.question);
    const backend = deps.model?.backend ?? rulesBaseline(c);
    const options = question.kind === 'Choice' ? question.options.length : 2;
    const base = { id: c.id, site: c.site, tags: c.tags, options, expected: c.expected };
    const started = deps.clock().getTime();
    try {
      const reply = Reply.parse(await backend.answer(c.state, [question]));
      const latencyMs = deps.clock().getTime() - started;
      const { answers, ...usage } = Array.isArray(reply) ? { answers: reply } : reply;
      const [answer] = checked([question], answers);
      if (!answer) throw new Error('no answer');
      const { answer: said, p } = top(answer);
      results.push({
        ...base,
        latencyMs,
        answer: said,
        p,
        margin: margin(answer),
        accepted: deps.model ? accepted(deps.model.acceptAt, c.site, answer) : margin(answer) > 0,
        // An even answer picks nothing: it is never right, whatever its first option is.
        correct: margin(answer) > 0 && said === c.expected,
        ...usage,
      });
    } catch (error) {
      const latencyMs = deps.clock().getTime() - started;
      results.push({
        ...base,
        latencyMs,
        unavailable: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

const quantile = (xs: readonly number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0)
    : 0;
};
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/** Expected calibration error of the top answer's probability, in 5 equal bins. */
function ece(rows: readonly { p: number; correct: boolean }[]) {
  if (!rows.length) return null;
  let total = 0;
  for (let bin = 0; bin < 5; bin++) {
    const inBin = rows.filter((r) => Math.min(4, Math.floor(r.p * 5)) === bin);
    if (!inBin.length) continue;
    const confidence = inBin.reduce((s, r) => s + r.p, 0) / inBin.length;
    const accuracy = inBin.filter((r) => r.correct).length / inBin.length;
    total += (inBin.length / rows.length) * Math.abs(confidence - accuracy);
  }
  return total;
}

/** The ADR-0019 per-turn packet: latency is gated for packets of at most this many input tokens. */
const PACKET_TOKENS = 1024;

const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * One site's numbers. Selective accuracy is the share right among accepted answers; tokens and
 * dollars are per call, as the backend reported them.
 */
function summarise(results: readonly CaseResult[]) {
  const answered = results.flatMap((r) => ('unavailable' in r ? [] : [r]));
  const taken = answered.filter((r) => r.accepted);
  // A refusal (a 422) returns at once: latency counts answered cases only.
  const latencies = answered.map((r) => r.latencyMs);
  const packets = answered.filter((r) => (r.inputTokens ?? 0) <= PACKET_TOKENS);
  const tokens = answered.flatMap((r) => (r.inputTokens === undefined ? [] : [r.inputTokens]));
  const costs = answered.flatMap((r) => (r.costUsd === undefined ? [] : [r.costUsd]));
  const perCall = mean(costs);
  return {
    n: results.length,
    answered: answered.length,
    unavailable: results.length - answered.length,
    accepted: taken.length,
    acceptedCorrect: taken.filter((r) => r.correct).length,
    coverage: ratio(taken.length, results.length) ?? 0,
    selectiveAccuracy: ratio(taken.filter((r) => r.correct).length, taken.length),
    accuracy: ratio(answered.filter((r) => r.correct).length, results.length) ?? 0,
    ece: ece(answered),
    latencyMs: {
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
      total: latencies.reduce((a, b) => a + b, 0),
    },
    packetLatencyMs: {
      n: packets.length,
      p50: quantile(
        packets.map((r) => r.latencyMs),
        0.5,
      ),
      p95: quantile(
        packets.map((r) => r.latencyMs),
        0.95,
      ),
    },
    inputTokens: { mean: mean(tokens), max: tokens.length ? Math.max(...tokens) : null },
    usdPer1000Calls: perCall === null ? null : perCall * 1000,
  };
}
export type SiteSummary = ReturnType<typeof summarise>;

/**
 * The gates ADR-0019 froze before the held-out run: a site may be automatic only when, on the
 * held-out split, its accepted answers are at least this accurate, it accepts at least this share
 * of cases, and it gets more cases right and accepted than the rules baseline.
 */
export const QUALITY_GATES: Record<DecisionSite, { selectiveAccuracy: number; coverage: number }> =
  {
    supervision: { selectiveAccuracy: 0.9, coverage: 0.4 },
    relevance: { selectiveAccuracy: 0.8, coverage: 0.5 },
    'next-step': { selectiveAccuracy: 0.85, coverage: 0.4 },
    evidence: { selectiveAccuracy: 0.9, coverage: 0.4 },
  };

/** Whether `site`'s summary meets its gate, beating `baseline` (the rules' summary) when given. */
export function meetsGate(site: DecisionSite, s: SiteSummary, baseline?: SiteSummary) {
  const gate = QUALITY_GATES[site];
  return (
    (s.selectiveAccuracy ?? 0) >= gate.selectiveAccuracy &&
    s.coverage >= gate.coverage &&
    (!baseline || s.acceptedCorrect > baseline.acceptedCorrect)
  );
}

/**
 * Each site's threshold by ADR-0019's rule, from calibration results only: rank the answers by
 * margin, take the largest top set (cut between distinct margins) whose accuracy meets the site's
 * gate, and use its lowest margin, never below 0.5, truncated to 3 places. A site where no top set
 * meets the gate gets 1: only certain answers are accepted.
 */
export function fitAcceptAt(results: readonly CaseResult[]): AcceptAt {
  const fit = (site: DecisionSite) => {
    const answered = results.flatMap((r) => (r.site !== site || 'unavailable' in r ? [] : [r]));
    const cuts = [...new Set(answered.map((r) => r.margin))].sort((a, b) => a - b);
    for (const cut of cuts) {
      const top = answered.filter((r) => r.margin >= cut);
      const right = top.filter((r) => r.correct).length;
      if (right / top.length >= QUALITY_GATES[site].selectiveAccuracy) {
        return Math.max(0.5, Math.floor(cut * 1000) / 1000);
      }
    }
    return 1;
  };
  return Object.fromEntries(DECISION_SITES.map((site) => [site, fit(site)])) as Record<
    DecisionSite,
    number
  >;
}

/** The report `pnpm decisions:evaluate --json` prints: per site, per tag, and every miss. */
export function report(
  backend: string,
  dataset: string,
  results: readonly CaseResult[],
  acceptAt?: AcceptAt,
) {
  const sites = DECISION_SITES.filter((site) => results.some((r) => r.site === site));
  const models = [...new Set(results.flatMap((r) => ('model' in r && r.model ? [r.model] : [])))];
  return {
    backend,
    dataset,
    ...(acceptAt ? { acceptAt } : {}),
    models,
    sites: Object.fromEntries(
      sites.map((site) => {
        const mine = results.filter((r) => r.site === site);
        const tags = [...new Set(mine.flatMap((r) => r.tags))].sort();
        return [
          site,
          {
            ...summarise(mine),
            byTag: Object.fromEntries(
              tags.map((t) => [t, summarise(mine.filter((r) => r.tags.includes(t)))]),
            ),
          },
        ];
      }),
    ),
    misses: results.filter((r) => 'unavailable' in r || !r.correct),
  };
}
export type EvalReport = ReturnType<typeof report>;
