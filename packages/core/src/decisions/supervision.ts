import { createHash } from 'node:crypto';
import type { Agent } from '../agents/names.js';
import { AGENT_STATES, type AgentState } from '../agents/states.js';
import type { MesaContext } from '../context.js';
import type { Clock } from '../lib/clock.js';
import {
  type Claim,
  type PlacementReply,
  type PlacementStore,
  placementStore,
} from '../sessions/signals/placements.js';
import { decide } from './decide.js';
import { KEY_OF } from './keys.js';
import { type DecisionModels, PER_TURN_MS } from './models.js';
import { rulesBackend } from './rules.js';
import {
  ACCEPT_AT,
  type AcceptAt,
  accepted,
  type DecisionSite,
  margin,
  PASSED_GATE,
  siteQuestion,
} from './sites.js';
import { SYSTEM_ONE_MODELS, type SystemOneProvider } from './systemone.js';
import type { Backend, DecisionsModel } from './types.js';

// The supervision site beside the Board (ADR-0019, #461): a session no hook or listing speaks for
// is placed from its screen by the chosen model, in a call no Board read waits on. Hooks, the
// listing and process facts still outrank it (ADR-0003); the guardrail never asks it.

/** Changed whenever what is asked or accepted changes, so no reply outlives its policy. */
export const SUPERVISION_POLICY = 'supervision-1';

/**
 * The screen tail sent, at most, in characters. On the corpus (#638) Jev counted about 450 tokens
 * of wording plus 0.39 a character of state, so this keeps a call near 1,000 input tokens, within
 * ADR-0019's per-turn packet; the corpus's screens are 510 characters at the median.
 */
export const SCREEN_CHARS = 1_400;

/** An ask in flight longer than this was abandoned by a mesa that stopped: it may be claimed again. */
const ABANDONED_MS = 2 * PER_TURN_MS;

/** The sites each model passed the gate on, and its thresholds: the real tables unless a test's. */
export type SupervisionTables = {
  gate: Record<SystemOneProvider, readonly DecisionSite[]>;
  acceptAt: Record<SystemOneProvider, AcceptAt>;
};
const TABLES: SupervisionTables = { gate: PASSED_GATE, acceptAt: ACCEPT_AT };

/** The model that may place sessions: the chosen one, only if it passed the supervision gate. */
export function supervisingModel(
  model: DecisionsModel | undefined,
  gate: SupervisionTables['gate'] = PASSED_GATE,
): SystemOneProvider | undefined {
  return model && model !== 'none' && gate[model].includes('supervision') ? model : undefined;
}

/** What the model reads: the agent and the last SCREEN_CHARS of its screen, as the corpus has it. */
export function supervisionState(agent: Agent, tail: string): string {
  const screen = Array.from(tail.trimEnd()).slice(-SCREEN_CHARS).join('');
  return `Agent: ${agent}\nScreen tail:\n${screen}`;
}

/** The cache key: the session, a hash of the state sent, the model id and the policy. */
export function supervisionKey(id: string, state: string, provider: SystemOneProvider): string {
  const hash = createHash('sha256').update(state).digest('hex').slice(0, 16);
  return `${id}:${hash}:${SYSTEM_ONE_MODELS[provider]}:${SUPERVISION_POLICY}`;
}

const QUESTION = siteQuestion('supervision', {
  kind: 'Choice',
  id: 'state',
  options: [...AGENT_STATES],
});

/**
 * One supervision ask through Faro, at the model's threshold: the state when its margin reaches
 * it, else an abstention, or the failure that kept the rules' state.
 */
async function ask(
  deps: { backend: Backend<string>; provider: SystemOneProvider; acceptAt: AcceptAt; clock: Clock },
  claim: Claim,
): Promise<PlacementReply> {
  const { provider } = deps;
  const decision = await decide(
    {
      backends: [rulesBackend<string>([]), deps.backend],
      // The rules have no opinion on a screen they could not place: the model is always asked.
      profile: { decisions: { model: provider, threshold: Number.POSITIVE_INFINITY } },
      clock: deps.clock,
    },
    claim.state,
    [QUESTION],
  );
  const reply = { key: claim.key, at: decision.at };
  const asked = {
    model: decision.model ?? SYSTEM_ONE_MODELS[provider],
    latencyMs: decision.latencyMs,
    ...(decision.inputTokens === undefined ? {} : { inputTokens: decision.inputTokens }),
  };
  const [answer] = decision.answers;
  if (decision.backend !== provider || answer?.kind !== 'Choice') {
    return { ...reply, ask: { ...asked, fallbackReason: decision.fallbackReason ?? 'no answer' } };
  }
  const m = margin(answer);
  const answered = { ...reply, probabilities: answer.probabilities };
  if (!accepted(deps.acceptAt, 'supervision', answer)) {
    const fallbackReason = `abstained: margin ${m.toFixed(3)} below ${deps.acceptAt.supervision}`;
    return { ...answered, ask: { ...asked, margin: m, fallbackReason } };
  }
  const state = answer.answer as AgentState;
  const confidence = answer.probabilities[state] ?? 0;
  return {
    ...answered,
    placed: { state, confidence, source: provider },
    ask: { ...asked, margin: m },
  };
}

/** What one placing call did with one session: its reply saved, or dropped as stale. */
export type Placed = { id: string; key: string } & (
  | { saved: PlacementReply }
  | { dropped: string }
);

/**
 * Places the sessions the Board's looks want placed (placements.ts): asks the supervising model
 * about each claimed screen side by side, within the per-turn deadline, and saves each reply for
 * the next look. A reply is dropped when the model was switched or lost its key meanwhile, or the
 * screen changed. A model that did not pass the supervision gate is never asked.
 */
export async function placeUnsure(deps: {
  store: PlacementStore;
  /** The model chosen now (`decisions.model`), read again when a reply comes back. */
  model: () => DecisionsModel | undefined;
  /** The chosen model as a backend that reads its key when asked. */
  backend: () => Backend<string> | undefined;
  hasKey: (provider: SystemOneProvider) => Promise<boolean>;
  tables?: SupervisionTables;
  clock: Clock;
}): Promise<Placed[]> {
  const { gate, acceptAt } = deps.tables ?? TABLES;
  const provider = supervisingModel(deps.model(), gate);
  const backend = deps.backend();
  if (!provider || !backend) return [];
  const claims = deps.store.claim(SYSTEM_ONE_MODELS[provider], ABANDONED_MS);
  const asking = { backend, provider, acceptAt: acceptAt[provider], clock: deps.clock };
  return Promise.all(
    claims.map(async (claim): Promise<Placed> => {
      const { id, key, refused } = claim;
      if (refused) return { id, key, saved: refused };
      const reply = await ask(asking, claim);
      const stale =
        supervisingModel(deps.model(), gate) !== provider
          ? 'the model was switched'
          : !(await deps.hasKey(provider))
            ? 'the key was removed'
            : undefined;
      if (stale) {
        deps.store.settle(id, key, undefined);
        return { id, key, dropped: stale };
      }
      return deps.store.settle(id, key, reply)
        ? { id, key, saved: reply }
        : { id, key, dropped: 'the screen changed' };
    }),
  );
}

/**
 * The profile's placing call (`mesa decisions place`), run beside the Board read: the chosen
 * model at the per-turn deadline, with its key from the Keychain at call time.
 */
export function boardPlacing(ctx: MesaContext, models: Pick<DecisionModels, 'active' | 'keys'>) {
  return () =>
    placeUnsure({
      store: placementStore(ctx.paths.placements, ctx),
      model: () => ctx.configIfAny()?.decisions.model,
      backend: () => models.active(PER_TURN_MS),
      hasKey: async (provider) =>
        (await models.keys.list()).some((k) => k.provider === KEY_OF[provider] && k.set),
      clock: ctx.clock,
    });
}
