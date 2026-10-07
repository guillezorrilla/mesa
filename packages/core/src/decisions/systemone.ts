import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { namesOf } from './rules.js';
import type { Answer, Question } from './types.js';

// The System One backend (ADR-0019, 2026-10-05 amendment): Faro's questions over the System One
// wire format, which Jev (TypeSafe) and CLEF (Cloudflare Workers AI) both answer. Only the URL,
// the auth, the `model` id and Cloudflare's response envelope differ.

/** The hosted decision models Mesa can ask, by provider. */
export const SYSTEM_ONE_PROVIDERS = ['jev', 'clef'] as const;
export type SystemOneProvider = (typeof SYSTEM_ONE_PROVIDERS)[number];

/**
 * The model id Mesa sends each provider, pinned because `ACCEPT_AT` was fitted on it: a new id
 * needs a new calibration and held-out run (ADR-0019).
 */
export const SYSTEM_ONE_MODELS: Record<SystemOneProvider, string> = {
  jev: 'jev-1.13.0',
  clef: 'clef-flash',
};

const PROVIDERS: Record<
  SystemOneProvider,
  {
    label: string;
    url: (accountId: string | undefined, model: string) => string;
    /** List price per million input tokens, by the requested model; output is not billed. */
    usdPerMInput: (model: string) => number | undefined;
  }
> = {
  jev: {
    label: 'Jev',
    url: () => 'https://api.typesafe.ai/v1/systemone',
    usdPerMInput: () => 0.042,
  },
  clef: {
    label: 'CLEF',
    url: (accountId, model) =>
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId ?? '')}/ai/run/@cf/cloudflare/${model}`,
    usdPerMInput: (model) => ({ 'clef-flash': 0.09, clef: 0.24 })[model],
  },
};

const finite = z.number().refine(Number.isFinite, 'not finite');
const WireAnswer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: finite }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), finite),
    confidence: finite,
  }),
  z.object({
    type: z.literal('score'),
    score: finite,
    probabilities: z.record(z.string(), finite),
    confidence: finite,
  }),
]);
const WireResponse = z.object({
  model: z.string(),
  answers: z.record(z.string(), WireAnswer),
  usage: z.object({ input_tokens: z.number() }).optional(),
});
/** Cloudflare's REST envelope around the System One body. */
const CloudflareEnvelope = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

/** The wire question: Faro's wording when given, else the bare names (`null` descriptions). */
export function wireQuestion(q: Question) {
  if (q.kind === 'Noul') {
    return { type: 'noul', instructions: q.statement, ...(q.criteria && { criteria: q.criteria }) };
  }
  const names = namesOf(q);
  const instructions = q.instructions ?? `Pick the ${q.kind === 'Choice' ? 'option' : 'level'}.`;
  if (q.kind === 'Score') {
    return { type: 'score', instructions, criteria: names.map((n) => q.criteria?.[n] ?? n) };
  }
  return {
    type: 'choice',
    instructions,
    criteria: Object.fromEntries(names.map((n) => [n, q.criteria?.[n] ?? null])),
  };
}

/** Probabilities `ps` (one per name, in order) scaled to sum to 1: the wire rounds to 4 places. */
function normalised(names: readonly string[], ps: readonly (number | undefined)[]) {
  if (ps.some((p) => p === undefined || p < 0)) return undefined;
  const total = ps.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  if (!(total > 0.99 && total < 1.01)) return undefined;
  return Object.fromEntries(names.map((n, i) => [n, (ps[i] ?? 0) / total]));
}

/** One wire answer as Faro's Answer, or undefined when it does not answer `q`. */
function toFaro(q: Question, wire: z.infer<typeof WireAnswer>): Answer | undefined {
  if (q.kind === 'Noul') {
    if (wire.type !== 'noul' || wire.noul < 0 || wire.noul > 1) return undefined;
    return { id: q.id, kind: 'Noul', answer: wire.noul > 0.5, probabilities: wire.noul };
  }
  if (wire.type === 'noul') return undefined;
  const names = namesOf(q);
  const confidence = Math.min(1, Math.max(0, wire.confidence));
  if (q.kind === 'Choice') {
    if (wire.type !== 'choice' || !names.includes(wire.choice)) return undefined;
    const probabilities = normalised(
      names,
      names.map((n) => wire.probabilities[n]),
    );
    // The pick must be the likeliest option (to the wire's rounding), or the reply contradicts itself.
    const top = probabilities && Math.max(...Object.values(probabilities));
    if (!probabilities || top === undefined || (probabilities[wire.choice] ?? 0) < top - 1e-3) {
      return undefined;
    }
    return { id: q.id, kind: 'Choice', answer: wire.choice, probabilities, confidence };
  }
  // A Score's probabilities are keyed by level index ("0", "1", ...), lowest first.
  if (wire.type !== 'score') return undefined;
  const probabilities = normalised(
    names,
    names.map((_, i) => wire.probabilities[String(i)]),
  );
  if (!probabilities || wire.score < 0 || wire.score > names.length - 1) return undefined;
  return {
    id: q.id,
    kind: 'Score',
    answer: wire.score / (names.length - 1),
    probabilities,
    confidence,
  };
}

/** Why a status failed, in words that name the provider and never the key. */
function statusError(label: string, status: number) {
  if (status === 401 || status === 403)
    return new MesaError('invalid_config', `${label} rejected the key (HTTP ${status})`);
  if (status === 422) return new MesaError('internal', `${label} refused the request (HTTP 422)`);
  if (status === 429) return new MesaError('internal', `${label} rate limit reached (HTTP 429)`);
  if (status === 529) return new MesaError('internal', `${label} is overloaded (HTTP 529)`);
  if (status >= 500) return new MesaError('internal', `${label} is unavailable (HTTP ${status})`);
  return new MesaError('internal', `${label} answered HTTP ${status}`);
}

export type SystemOneDeps = {
  provider: SystemOneProvider;
  http: Http;
  /** The TypeSafe API key (jev) or the Cloudflare API token (clef). */
  key: string;
  /** The Cloudflare account ID; clef only. */
  accountId?: string;
  /** The `model` field: `jev-1.13.0`, `clef-flash` or `clef`. */
  model: string;
  /** Abandon a request after this long (ADR-0019 deadlines). */
  deadlineMs: number;
};

/** One call's result: Faro's answers, the model id that answered, its input tokens and list price. */
export type SystemOneReply = {
  answers: Answer[];
  model: string;
  inputTokens?: number;
  costUsd?: number;
};

/**
 * The `jev` or `clef` backend: posts `state` (a string, or rendered JSON) and the questions, and
 * maps each wire answer to Faro's shape: Score indices to 0-1, probabilities renormalised by name,
 * Noul P(true) kept as is. A missing or mismatched answer, an HTTP error, Cloudflare's
 * `success: false`, an unreachable host or the deadline throws a MesaError naming the provider,
 * and Faro's rules stand.
 */
export function systemOneBackend(deps: SystemOneDeps) {
  const { label, url, usdPerMInput } = PROVIDERS[deps.provider];
  return {
    name: deps.provider,
    answer: async (state: unknown, questions: Question[]): Promise<SystemOneReply> => {
      const body = {
        state: typeof state === 'string' ? state : JSON.stringify(state),
        model: deps.model,
        questions: Object.fromEntries(questions.map((q) => [q.id, wireQuestion(q)])),
      };
      let json: unknown;
      try {
        const response = await deps.http(url(deps.accountId, deps.model), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(deps.deadlineMs),
        });
        if (!response.ok) throw statusError(label, response.status);
        json = await response.json().catch(() => undefined);
      } catch (error) {
        if (error instanceof MesaError) throw error;
        if (error instanceof Error && error.name === 'TimeoutError')
          throw new MesaError('timeout', `${label} did not answer within ${deps.deadlineMs} ms`);
        throw new MesaError('internal', `${label} could not be reached`);
      }
      if (deps.provider === 'clef') {
        const envelope = CloudflareEnvelope.safeParse(json);
        if (!envelope.success)
          throw new MesaError('internal', `${label} answered an unexpected body`);
        if (!envelope.data.success) {
          const why = envelope.data.errors?.[0]?.message ?? 'no reason given';
          throw new MesaError('internal', `${label} reported an error: ${why}`);
        }
        json = envelope.data.result;
      }
      const reply = WireResponse.safeParse(json);
      if (!reply.success) throw new MesaError('internal', `${label} answered an unexpected body`);
      const answers = questions.map((q) => {
        const wire = reply.data.answers[q.id];
        const answer = wire && toFaro(q, wire);
        if (!answer) throw new MesaError('internal', `${label} did not answer ${q.id}`);
        return answer;
      });
      const inputTokens = reply.data.usage?.input_tokens;
      const perM = usdPerMInput(deps.model);
      return {
        answers,
        model: reply.data.model,
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(inputTokens === undefined || perM === undefined
          ? {}
          : { costUsd: (inputTokens * perM) / 1e6 }),
      };
    },
  };
}
