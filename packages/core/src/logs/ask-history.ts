import { z } from 'zod';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { CloudViewSchema } from './gcp-config.js';
import { OWN_FILTERS } from './own-filters.js';

// Ask conversations (CONTEXT.md, Ask (logs)), kept per profile so a follow-up keeps context and the
// Logs tab's sidebar lists them: each turn's question, filters, answer, citations and the queries
// its agent ran.

/** How many conversations are kept, newest first. */
const KEPT = 20;

/** The filters a turn was asked with, as a saved view holds them, without a name. */
const FiltersSchema = CloudViewSchema.omit({ name: true }).extend({
  since: z.string().optional(),
  trace: z.string().optional(),
  all: z.boolean().optional(),
});

/** A Logging query an Ask ran: the filter, and the project when it read one only. */
const QuerySchema = z.object({
  project: z.string().optional(),
  filter: z.string(),
  /** What the run asked for itself (own-filters.ts): what Run and Save as view apply. */
  own: FiltersSchema.pick(OWN_FILTERS).partial().optional(),
});
export type AskQuery = z.infer<typeof QuerySchema>;
export type AskOwn = NonNullable<AskQuery['own']>;

const TurnSchema = z.object({
  at: z.string(),
  question: z.string(),
  query: FiltersSchema,
  answer: z.string(),
  cited: z.array(z.string()),
  queries: z.array(QuerySchema),
  session: z.string(),
});
export type AskTurn = z.infer<typeof TurnSchema>;

const ConversationSchema = z.object({ id: z.string(), turns: z.array(TurnSchema).min(1) });
export type CloudAsk = z.infer<typeof ConversationSchema>;

const AsksSchema = z.array(ConversationSchema);

/** The kept conversations, newest first; none when the file is missing or does not read. */
export const readAsks = (file: string): CloudAsk[] => readCache(file, AsksSchema, []);

/**
 * Adds `turn` to conversation `id` (a new one when it has none), moved first, under the file's
 * lock so two Asks at once both land; the oldest past KEPT go.
 */
export function keepTurn(file: string, id: string, turn: AskTurn, lock: LockDeps): CloudAsk {
  let ask: CloudAsk = { id, turns: [turn] };
  changeJson(
    file,
    AsksSchema,
    (kept = []) => {
      const before = kept.find((each) => each.id === id);
      ask = { id, turns: [...(before?.turns ?? []), turn] };
      return [ask, ...kept.filter((each) => each.id !== id)].slice(0, KEPT);
    },
    lock,
  );
  return ask;
}
