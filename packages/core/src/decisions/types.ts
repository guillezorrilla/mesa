import { z } from 'zod';
import { DECISIONS_BACKENDS } from './backends.js';

/** A decisions backend (CONTEXT.md, Backend): what a profile's `decisions.backend` names. */
export const DecisionsBackendSchema = z.enum(DECISIONS_BACKENDS);
export type BackendName = z.infer<typeof DecisionsBackendSchema>;

/**
 * Who answered a Decision: a backend, or `rules-fallback` when the named one was asked and failed.
 * `adapter`, the headless agent backend ADR-0020 removed, is still named by older receipts and runs.
 */
export const DecidedBySchema = z.union([
  DecisionsBackendSchema,
  z.literal('rules-fallback'),
  z.literal('adapter'),
]);

// Faro's question primitives, exactly Jev's (ADR-0004), and the shapes every backend answers in.

const id = z.string().min(1);
const distinct = (words: string[]) => new Set(words).size === words.length;
/**
 * Optional wording a model backend reads (ADR-0019): what to decide, and a description per
 * option, level, or (for a Noul) `true`/`false`. Rules ignore both; answers stay keyed by name.
 */
const instructions = z.string().min(1).optional();
const criteria = z.record(z.string(), z.string()).optional();

/** Pick one of 2 to 255 options. */
const ChoiceSchema = z.strictObject({
  kind: z.literal('Choice'),
  id,
  options: z.array(z.string().min(1)).min(2).max(255).refine(distinct, 'options must differ'),
  instructions,
  criteria,
});
/** A position on an ordered rubric of 2 to 10 levels, lowest first. */
const ScoreSchema = z.strictObject({
  kind: z.literal('Score'),
  id,
  levels: z.array(z.string().min(1)).min(2).max(10).refine(distinct, 'levels must differ'),
  instructions,
  criteria,
});
/** Yes or no, as one calibrated probability that `statement` is true. */
const NoulSchema = z.strictObject({
  kind: z.literal('Noul'),
  id,
  statement: z.string().min(1),
  criteria,
});

const QuestionSchema = z.discriminatedUnion('kind', [ChoiceSchema, ScoreSchema, NoulSchema]);
export const QuestionsSchema = z
  .array(QuestionSchema)
  .min(1)
  .refine((qs) => distinct(qs.map((q) => q.id)), 'question ids must differ');

export type Choice = z.infer<typeof ChoiceSchema>;
export type Score = z.infer<typeof ScoreSchema>;
export type Question = z.infer<typeof QuestionSchema>;

const probability = z.number().min(0).max(1);
const perName = z.record(z.string(), probability);

/**
 * One answer per question. Choice: the likeliest option, a probability per option, a confidence.
 * Score: the probability-weighted position from 0 (lowest level) to 1 (highest), a probability
 * per level, a confidence. Noul: whether the statement holds (above 0.5), its one probability, no
 * confidence (ADR-0004). A backend's answers are parsed with this before anyone sees them.
 */
export const AnswerSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id,
    kind: z.literal('Choice'),
    answer: z.string(),
    probabilities: perName,
    confidence: probability,
  }),
  z.strictObject({
    id,
    kind: z.literal('Score'),
    answer: probability,
    probabilities: perName,
    confidence: probability,
  }),
  z.strictObject({ id, kind: z.literal('Noul'), answer: z.boolean(), probabilities: probability }),
]);
export type Answer = z.infer<typeof AnswerSchema>;

/** One call to Faro, whole: what was asked, what came back, from which backend, how fast. */
export type Decision = {
  questions: Question[];
  answers: Answer[];
  /**
   * Who answered: `rules` (also when even answers stood in for failing rules), the named
   * backend, or `rules-fallback` when the named backend was asked and failed.
   */
  backend: z.infer<typeof DecidedBySchema>;
  /**
   * The call's price as the backend reports it, for information only.
   */
  costUsd?: number;
  /** With `rules-fallback`: why the named backend's answer was not used. */
  fallbackReason?: string;
  /** ISO. */
  at: string;
  latencyMs: number;
};

/** A decision retained in a durable automation queue, with its original probabilities. */
export const DecisionSchema: z.ZodType<Decision> = z.strictObject({
  questions: QuestionsSchema,
  answers: z.array(AnswerSchema),
  backend: DecidedBySchema,
  costUsd: z.number().nonnegative().optional(),
  fallbackReason: z.string().optional(),
  at: z.iso.datetime(),
  latencyMs: z.number().nonnegative(),
});

/** A decisions backend (ADR-0004): answers valid questions about `state`, or throws. */
export type Backend<S = unknown> = {
  name: BackendName;
  /**
   * Answers, or `{answers, costUsd}`; whatever it returns is parsed and checked against the
   * questions (decide.ts).
   */
  answer: (state: S, questions: Question[]) => Promise<unknown>;
};

/**
 * Where decisions go once made: the action recorder hands each action one, so they land in its
 * receipt (receipts/recorder.ts); tests keep them in memory.
 */
export type DecisionRecorder = { record: (decision: Decision) => void | Promise<void> };
