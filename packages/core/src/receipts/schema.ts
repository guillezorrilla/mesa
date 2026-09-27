import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { AnswerSchema, DecidedBySchema, type Decision } from '../decisions/types.js';
import { ULID } from '../lib/ids.js';
import { NoteTimeSchema } from '../lib/time.js';
import { RECEIPT_TYPES } from './receipt-file.js';

/**
 * One Faro answer as a receipt keeps it: Faro's own answer (ADR-0004), its question's id as
 * `question`, and the backend that decided it.
 */
function recorded<S extends { id: z.ZodType }>(answer: z.ZodObject<S>) {
  const { id: _, ...fields } = answer.shape;
  return z.strictObject({ question: z.string(), ...fields, backend: DecidedBySchema });
}

const [choice, score, noul] = AnswerSchema.options;
const DecisionSchema = z.discriminatedUnion('kind', [
  recorded(choice),
  recorded(score),
  recorded(noul),
]);

/**
 * Every number in `value` to 6 decimals: normalising weights leaves float noise
 * (0.9500000000000001), which a receipt, read by a person, keeps as 0.95.
 */
const sixDecimals = (value: unknown): unknown =>
  typeof value === 'number'
    ? Math.round(value * 1e6) / 1e6
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sixDecimals(v)]))
      : value;

/**
 * A Decision as a receipt keeps it: one entry per answer, its numbers to 6 decimals, with the
 * backend that answered. The Decision itself stays exact.
 */
export function decisionEntries(
  { answers, backend }: Decision,
  redact: (text: string) => string,
): z.input<typeof DecisionSchema>[] {
  const questions = redactedLabels(
    answers.map((a) => a.id),
    redact,
  );
  return answers.map(({ id, ...answer }) => {
    const base = { question: questions.get(id) ?? redact(id), backend };
    const rounded = sixDecimals(answer) as typeof answer;
    if (rounded.kind === 'Noul') return { ...base, ...rounded };
    const labels = redactedLabels(Object.keys(rounded.probabilities), redact);
    const probabilities = Object.fromEntries(
      Object.entries(rounded.probabilities).map(([label, p]) => [
        labels.get(label) ?? redact(label),
        p,
      ]),
    );
    return rounded.kind === 'Choice'
      ? {
          ...base,
          ...rounded,
          probabilities,
          answer: labels.get(rounded.answer) ?? redact(rounded.answer),
        }
      : { ...base, ...rounded, probabilities };
  });
}

/** Secret-bearing labels stay distinct, so redaction cannot discard probability mass. */
function redactedLabels(labels: string[], redact: (text: string) => string) {
  const used = new Set<string>();
  return new Map(
    labels.map((label) => {
      const clean = redact(label);
      let unique = clean;
      for (let n = 2; used.has(unique); n++) unique = `${clean} (${n})`;
      used.add(unique);
      return [label, unique];
    }),
  );
}

/** The receipt frontmatter, documented field by field in docs/receipts.md. */
export const ReceiptSchema = z.strictObject({
  type: z.enum(RECEIPT_TYPES),
  id: z.string().regex(ULID, 'must be a ULID'),
  profile: z.string(),
  project: z.string().optional(),
  session: z.string().optional(),
  agent: AgentSchema.optional(),
  started: NoteTimeSchema,
  ended: NoteTimeSchema.optional(),
  status: z.enum(['ok', 'failed', 'blocked']),
  /** The mesa command line, key values redacted. */
  command: z.string(),
  decisions: z.array(DecisionSchema).default([]),
  inputs: z.record(z.string(), z.unknown()).default({}),
  outputs: z.record(z.string(), z.unknown()).default({}),
  /** In US dollars, for information (for example `total_cost_usd` from `claude -p`). */
  cost: z.number().min(0).optional(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;
export type ReceiptInput = Omit<z.input<typeof ReceiptSchema>, 'id' | 'started'> & {
  started?: string;
  /** The body's first line. */
  summary: string;
  /** Markdown under `## Details`. */
  details?: string;
};
