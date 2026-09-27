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

/** A Decision as a receipt keeps it: one entry per answer, with the backend that answered. */
export const decisionEntries = ({ answers, backend }: Decision): z.input<typeof DecisionSchema>[] =>
  answers.map(({ id, ...answer }) => ({ question: id, ...answer, backend }));

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
