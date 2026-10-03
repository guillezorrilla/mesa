import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { namesOf } from './rules.js';
import type { Answer, Question } from './types.js';

// The Strands Decider backend (ADR-0019): Faro's questions over `POST /v1/systemone`, as the
// official `strands-decider serve` answers them (pinned upstream 6d5dec6).

/** What a Strands server says it is: `GET /health`. */
export const StrandsHealthSchema = z.object({
  status: z.literal('ok'),
  model: z.string(),
  base_model: z.string(),
  num_slots: z.number().int().positive(),
  max_length: z.number().int().positive(),
  device: z.string(),
});
export type StrandsHealth = z.infer<typeof StrandsHealthSchema>;

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
  const names = namesOf(q);
  const confidence = Math.min(1, Math.max(0, wire.type === 'noul' ? -1 : wire.confidence));
  if (q.kind === 'Choice') {
    if (wire.type !== 'choice' || !names.includes(wire.choice)) return undefined;
    const probabilities = normalised(
      names,
      names.map((n) => wire.probabilities[n]),
    );
    return (
      probabilities && { id: q.id, kind: 'Choice', answer: wire.choice, probabilities, confidence }
    );
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

export type StrandsDeps = {
  http: Http;
  /** The server's base URL, e.g. http://127.0.0.1:8099. */
  url: string;
  /** Abandon a request after this long (ADR-0019 deadlines). */
  deadlineMs: number;
};

/**
 * The `strands` backend: posts `state` (a string, or rendered JSON) and the questions, and maps
 * each wire answer to Faro's shape: Score indices to 0-1, probabilities renormalised by name,
 * Noul P(true) kept as is. A missing or mismatched answer, a 4xx (the strict window's 422), a
 * 5xx, or the deadline throws, and Faro's rules stand.
 */
export function strandsBackend(deps: StrandsDeps) {
  return {
    name: 'strands' as const,
    answer: async (state: unknown, questions: Question[]): Promise<Answer[]> => {
      const body = {
        state: typeof state === 'string' ? state : JSON.stringify(state),
        model: 'strands-decider',
        questions: Object.fromEntries(questions.map((q) => [q.id, wireQuestion(q)])),
      };
      const response = await deps.http(`${deps.url}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(deps.deadlineMs),
      });
      const reply = await readJson(response, WireResponse, 'the Strands server');
      return questions.map((q) => {
        const wire = reply.answers[q.id];
        const answer = wire && toFaro(q, wire);
        if (!answer) throw new MesaError('internal', `the Strands server did not answer ${q.id}`);
        return answer;
      });
    },
  };
}

/** The server's health, or a MesaError when it is down or not a Strands server. */
export async function strandsHealth(deps: StrandsDeps): Promise<StrandsHealth> {
  const response = await deps.http(`${deps.url}/health`, {
    signal: AbortSignal.timeout(deps.deadlineMs),
  });
  return readJson(response, StrandsHealthSchema, 'the Strands server');
}
