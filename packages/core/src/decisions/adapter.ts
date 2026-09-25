import { z } from 'zod';
import type { Runner } from '../process.js';
import { MesaError } from '../result.js';
import { namesOf, toAnswer } from './rules.js';
import type { Answer, Backend, Question } from './types.js';

// The adapter backend (ADR-0004 amendment): the same questions, answered by Claude Code headless
// on the subscription (`claude -p` with structured output), never the Messages API.

export const ADAPTER_TIMEOUT_MS = 20_000;
/** The screen's last characters that reach the prompt, after redaction. */
export const TAIL_CHARS = 2000;

const unit = { type: 'number', minimum: 0, maximum: 1 };
const perName = (names: string[]) => ({
  type: 'object',
  properties: Object.fromEntries(names.map((n) => [n, unit])),
  required: names,
  additionalProperties: false,
});

/**
 * The JSON schema for `questions`: per Choice an enum of its options, per Score an enum of its
 * levels, each with a probability per option or level and a confidence; per Noul a boolean and
 * a confidence in it (a recorded reply read a bare "probability" as exactly that).
 */
export function answerSchema(questions: Question[]) {
  const one = (q: Question) => {
    if (q.kind === 'Noul') {
      return {
        type: 'object',
        properties: { answer: { type: 'boolean' }, confidence: unit },
        required: ['answer', 'confidence'],
        additionalProperties: false,
      };
    }
    const names = namesOf(q);
    return {
      type: 'object',
      properties: { answer: { enum: names }, probabilities: perName(names), confidence: unit },
      required: ['answer', 'probabilities', 'confidence'],
      additionalProperties: false,
    };
  };
  return {
    type: 'object',
    properties: Object.fromEntries(questions.map((q) => [q.id, one(q)])),
    required: questions.map((q) => q.id),
    additionalProperties: false,
  };
}

const ask = (q: Question) =>
  q.kind === 'Choice'
    ? `- ${q.id} (Choice): exactly one of ${q.options.join(', ')}.`
    : q.kind === 'Score'
      ? `- ${q.id} (Score): a level on the ordered rubric ${q.levels.join(' < ')}.`
      : `- ${q.id} (Noul): is this true or false? "${q.statement}" With your confidence.`;

/** The prompt: the questions, then the state as JSON, secrets and home paths masked. */
export function adapterPrompt(
  state: unknown,
  questions: Question[],
  redact: (value: unknown, maxString?: number) => unknown,
) {
  const { tail, ...rest } = (state && typeof state === 'object' ? state : { value: state }) as {
    tail?: unknown;
  };
  const shown = {
    ...(redact(rest) as object),
    // Redacted whole, then its last characters: the bottom of the screen matters most.
    ...(typeof tail === 'string'
      ? { tail: String(redact(tail, Number.POSITIVE_INFINITY)).slice(-TAIL_CHARS) }
      : {}),
  };
  return [
    'You are Faro, the decisions layer of Mesa, a board of coding agent sessions.',
    'Answer each question about the state below. For every option or level give a probability',
    '(they sum to 1), and a confidence from 0 to 1 in your answer. Answer from the state alone.',
    '',
    'Questions:',
    ...questions.map(ask),
    '',
    'State (JSON):',
    JSON.stringify(shown, null, 2),
  ].join('\n');
}

/** The argv for one call: tools off, no MCP servers, nothing saved to the session history. */
export const adapterArgs = (prompt: string, questions: Question[]) => [
  '-p',
  prompt,
  '--output-format',
  'json',
  '--json-schema',
  JSON.stringify(answerSchema(questions)),
  '--model',
  'haiku',
  '--tools',
  '',
  '--no-session-persistence',
  '--strict-mcp-config',
];

const ResultSchema = z.object({
  is_error: z.literal(false),
  structured_output: z.record(z.string(), z.unknown()),
  total_cost_usd: z.number().optional(),
});
const Picked = z.object({
  answer: z.union([z.string(), z.boolean()]),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().min(0).max(1),
});

/** One structured answer as Faro's Answer: probabilities normalised, the model's own confidence. */
function toFaro(q: Question, raw: unknown): Answer {
  const picked = Picked.parse(raw);
  const { confidence } = picked;
  // A Noul's one probability is that its statement holds: the confidence, turned for a no.
  if (q.kind === 'Noul') return toAnswer(q, picked.answer === true ? confidence : 1 - confidence);
  const base = toAnswer(q, picked.probabilities);
  if (base.kind === 'Noul') return base;
  if (base.kind === 'Score') return { ...base, confidence };
  // The model's pick, when it is an option; else the likeliest by its own probabilities.
  const answer =
    typeof picked.answer === 'string' && q.kind === 'Choice' && q.options.includes(picked.answer)
      ? picked.answer
      : base.answer;
  return { ...base, answer, confidence };
}

/**
 * The adapter backend: one `claude -p` call per decision, with a 20 s timeout. Its answers and
 * `total_cost_usd` (for information only) go back to `decide`, which checks them; a failed call,
 * a timeout, or no `claude` throws, and `decide` falls back to rules.
 */
export function adapterBackend<S>(deps: {
  run: Runner;
  /** The shared redactor with the profile's home and secrets bound. */
  redact: (value: unknown, maxString?: number) => unknown;
}): Backend<S> {
  return {
    name: 'adapter',
    answer: async (state, questions) => {
      const prompt = adapterPrompt(state, questions, deps.redact);
      const res = await deps.run('claude', adapterArgs(prompt, questions), ADAPTER_TIMEOUT_MS);
      if (!res.ok) throw new MesaError('agent_unavailable', `claude -p: ${res.reason}`);
      const result = ResultSchema.parse(JSON.parse(res.stdout));
      return {
        answers: questions.map((q) => toFaro(q, result.structured_output[q.id])),
        ...(result.total_cost_usd === undefined ? {} : { costUsd: result.total_cost_usd }),
      };
    },
  };
}
