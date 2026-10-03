import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { AGENT_NAMES } from '../agents/names.js';
import { MesaError } from '../lib/result.js';
import { DECISION_SITES } from './sites.js';
import { QuestionsSchema } from './types.js';

// The decision evaluation corpus (ADR-0019): invented cases, one JSON object per line, in
// `corpus/calibration.jsonl` (thresholds are fitted here) and `corpus/heldout.jsonl` (gates).

export const CORPUS_TAGS = [
  'clear',
  'ambiguous',
  'contradictory',
  'injection',
  'option-order',
  'non-english',
  'insufficient-evidence',
  'long-input',
  'adversarial',
] as const;

export const EvalCaseSchema = z
  .strictObject({
    id: z.string().min(1),
    site: z.enum(DECISION_SITES),
    split: z.enum(['calibration', 'heldout']),
    family: z.string().min(1),
    tags: z.array(z.enum(CORPUS_TAGS)),
    /** The supervised session's agent; supervision only. */
    agent: z.enum(AGENT_NAMES).optional(),
    /** Exactly what a model sees. */
    state: z.string(),
    question: QuestionsSchema.element,
    /** The right answer: an option for a Choice, a boolean for a Noul. */
    expected: z.union([z.string(), z.boolean()]),
    /** Why `expected` is right, for the human reviewing a label. */
    rationale: z.string().min(1),
  })
  .refine(
    (c) =>
      c.question.kind === 'Noul'
        ? typeof c.expected === 'boolean'
        : c.question.kind === 'Choice' && c.question.options.includes(String(c.expected)),
    'expected must be a boolean for a Noul, or one of the Choice options',
  )
  .refine(
    (c) => (c.site === 'supervision') === (c.agent !== undefined),
    'agent is for supervision',
  );
export type EvalCase = z.infer<typeof EvalCaseSchema>;

/** The cases in a JSONL file, every line checked; a bad line is a usage error naming it. */
export function readCorpus(path: string): EvalCase[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, i) => {
      if (!line.trim()) return [];
      const parsed = EvalCaseSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new MesaError('usage', `${path}:${i + 1}: ${parsed.error.issues[0]?.message}`);
      }
      return [parsed.data];
    });
}
