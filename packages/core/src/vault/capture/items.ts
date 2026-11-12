import { z } from 'zod';
import { MesaError } from '../../lib/result.js';
import { VAULT_CAPTURE } from '../../skills/library.js';

// What a vault-capture run returns (skills/vault-capture): at most CAPTURE_MAX_ITEMS decisions and notes, as JSON.

/** The most items one capture saves. */
export const CAPTURE_MAX_ITEMS = 3;

const text = z.string().trim().min(1);
const unit = z.number().min(0).max(1);
/** A field a run may leave out, which models often write as null instead (docs/spikes/capture-model.md). */
const leftOutWhenNull = <T extends z.ZodType>(field: T) =>
  field.nullish().transform((v) => v ?? undefined);
/** The path of a note this session saved that the item replaces (coveringNote's ownPath checks it). */
const updates = leftOutWhenNull(text);

const CaptureItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('decision'),
    title: text,
    decision: text,
    rationale: text,
    /** Only where the Decision model scored it, as the transcript shows. */
    probabilities: leftOutWhenNull(z.record(z.string().min(1), unit)),
    confidence: leftOutWhenNull(unit),
    updates,
  }),
  z.object({ kind: z.literal('note'), title: text, body: text, updates }),
]);
export type CaptureItem = z.infer<typeof CaptureItemSchema>;

// The skill lists the most durable first, so a run that returns more keeps its first CAPTURE_MAX_ITEMS.
const CaptureSchema = z
  .array(CaptureItemSchema)
  .transform((items) => items.slice(0, CAPTURE_MAX_ITEMS));

/**
 * The items in a capture run's `output`: its JSON array, a code fence around it allowed. Output
 * that is not that array is `internal`, with why: a failed capture.
 */
export function captureItems(output: string): CaptureItem[] {
  const json = output
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, '$1')
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new MesaError('internal', `the ${VAULT_CAPTURE} run returned no JSON array`);
  }
  const parsed = CaptureSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new MesaError(
      'internal',
      `the ${VAULT_CAPTURE} run returned items that do not read${where}: ${issue?.message}`,
    );
  }
  return parsed.data;
}
