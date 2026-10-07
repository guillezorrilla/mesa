import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Clock } from '../lib/clock.js';
import { MesaError } from '../lib/result.js';
import { ON_DEMAND_MS, PER_TURN_MS } from './models.js';
import type { Packet } from './packet.js';
import { ACCEPT_AT, accepted, DECISION_SITES, type DecisionSite, margin } from './sites.js';
import type { Decision, DecisionsModel, Question } from './types.js';

// One ephemeral evaluation at a decision site (ADR-0019): a packet to the Decision model through
// Faro, read as accepted, abstained or unavailable. It writes nothing itself: whoever calls it
// decides what, if anything, is kept.

/**
 * How a call came: `automatic` beside a turn (the 1,500 ms deadline, and only at a site the model
 * qualified for), or `on-demand` from a tool or a command (10 s, any site).
 */
export const ASSIST_MODES = ['automatic', 'on-demand'] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];

export const DEADLINE_MS: Record<AssistMode, number> = {
  automatic: PER_TURN_MS,
  'on-demand': ON_DEMAND_MS,
};

/** Accepted: decisive enough to act on. Abstained: an answer came, not decisive enough. */
export const EVALUATION_STATUSES = ['accepted', 'abstained', 'unavailable'] as const;

export const EvaluationSchema = z.strictObject({
  site: z.enum(DECISION_SITES),
  mode: z.enum(ASSIST_MODES),
  status: z.enum(EVALUATION_STATUSES),
  /** A site the model did not qualify for (PASSED_GATE): on demand only. */
  experimental: z.literal(true).optional(),
  /** The model's pick: an option of the Choice, or the Noul's lean. */
  answer: z.union([z.string(), z.boolean()]).optional(),
  /** Its probabilities: per option, or the Noul's P(true). */
  probabilities: z.union([z.record(z.string(), z.number()), z.number()]).optional(),
  margin: z.number().optional(),
  acceptAt: z.number().optional(),
  /** The model id that answered. */
  model: z.string().optional(),
  /** Why no answer came. */
  reason: z.string().optional(),
  latencyMs: z.number(),
  costUsd: z.number().optional(),
  /** Answered from the session's ready answers, with no call. */
  cached: z.literal(true).optional(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

/** Why nothing is asked with no Decision model. */
export const NO_MODEL = 'no decision model: add a key with mesa decisions key set';

/** What a session keeps of its evaluations (session-decisions.ts). */
export type EvaluationMemory = {
  /** The answer made before for exactly this packet and policy, if any. */
  ready: (key: string) => Evaluation | undefined;
  /** Notes one evaluation; never its packet. */
  note: (evaluation: Evaluation, key: string) => void;
};

export type EvaluateDeps = {
  /** The Decision model in use; `none` asks nothing. */
  model: DecisionsModel;
  /** The sites it passed the held-out gate at (PASSED_GATE): the only automatic ones. */
  passed: readonly DecisionSite[];
  /** Faro, asked the packet within `deadlineMs`, its rules even (faro.ts); `signal` cancels it. */
  ask: (
    state: string,
    questions: Question[],
    deadlineMs: number,
    options: { signal?: AbortSignal },
  ) => Promise<Decision>;
  clock: Clock;
  memory?: EvaluationMemory;
};

/** No answer came: the reason, in words that never hold the packet. */
const unavailable = (site: DecisionSite, mode: AssistMode, reason: string, latencyMs = 0) =>
  ({ site, mode, status: 'unavailable', reason, latencyMs }) satisfies Evaluation;

/**
 * The key of a packet under a model and threshold: a new source revision, query, model or policy
 * is a new key. The session and profile are the memory's own (one file per session).
 */
const keyOf = (packet: Packet, model: string, acceptAt: number, revision: string) =>
  createHash('sha256')
    .update(JSON.stringify([packet.site, model, acceptAt, revision, packet.state, packet.question]))
    .digest('hex');

/** Rejects once `signal` aborts. */
const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const cancel = () => reject(new MesaError('internal', 'cancelled'));
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });

/**
 * Evaluates `packet` once. With no model, nothing is asked. An automatic call at a site the model
 * did not qualify for is unavailable; on demand it runs, marked experimental. An answer made
 * before for the same key is reused. The model answers within the mode's deadline (ADR-0019);
 * Faro's rules stand when it fails, which is unavailable, as is a call cancelled by `signal`,
 * which ends the request too. Its margin against ACCEPT_AT decides accepted or abstained.
 */
export async function evaluate(
  deps: EvaluateDeps,
  packet: Packet,
  options: { mode: AssistMode; signal?: AbortSignal; revision?: string },
): Promise<Evaluation> {
  const { site } = packet;
  const { mode, signal, revision = '' } = options;
  const { model } = deps;
  if (model === 'none') return unavailable(site, mode, NO_MODEL);
  const qualified = deps.passed.includes(site);
  if (mode === 'automatic' && !qualified)
    return unavailable(site, mode, `${model} did not qualify for automatic ${site} advice`);
  const acceptAt = ACCEPT_AT[model][site];
  const key = keyOf(packet, model, acceptAt, revision);
  const noted = (evaluation: Evaluation) => {
    const made = { ...evaluation, ...(qualified ? {} : { experimental: true as const }) };
    deps.memory?.note(made, key);
    return made;
  };
  const ready = deps.memory?.ready(key);
  if (ready) return noted({ ...ready, mode, latencyMs: 0, cached: true });
  const started = deps.clock().getTime();
  const asked = deps.ask(
    packet.state,
    [packet.question],
    DEADLINE_MS[mode],
    signal ? { signal } : {},
  );
  let decision: Decision;
  try {
    decision = await (signal ? Promise.race([asked, aborted(signal)]) : asked);
  } catch (error) {
    if (signal?.aborted)
      return noted(unavailable(site, mode, 'cancelled', deps.clock().getTime() - started));
    throw error;
  }
  const { latencyMs } = decision;
  const answer = decision.answers[0];
  if (decision.backend !== model || !answer)
    return noted(
      unavailable(site, mode, decision.fallbackReason ?? `${model} did not answer`, latencyMs),
    );
  return noted({
    site,
    mode,
    status: accepted(ACCEPT_AT[model], site, answer) ? 'accepted' : 'abstained',
    answer: answer.answer as string | boolean,
    probabilities: answer.probabilities,
    margin: margin(answer),
    acceptAt,
    ...(decision.model ? { model: decision.model } : {}),
    latencyMs,
    ...(decision.costUsd === undefined ? {} : { costUsd: decision.costUsd }),
  });
}
