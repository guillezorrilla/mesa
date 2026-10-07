import { join } from 'node:path';
import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { type Evaluation, type EvaluationMemory, EvaluationSchema } from './evaluate.js';

// A session's decision assistance (CONTEXT.md, Decision assistance): whether the person turned it
// off for this session, its recent use, and its ready answers, in `sessions/decisions/<id>.json`
// beside the session records, never in the vault. Bounded, and it never holds a packet or prompt.

/** How many uses and ready answers the file keeps, the newest. */
const USES = 20;
const READY = 16;

/** One evaluation as the session's use shows it: no packet, no answer text. */
const UseSchema = z.strictObject({
  at: z.iso.datetime(),
  site: EvaluationSchema.shape.site,
  mode: EvaluationSchema.shape.mode,
  status: EvaluationSchema.shape.status,
  model: z.string().optional(),
  margin: z.number().optional(),
  latencyMs: z.number(),
  cached: z.literal(true).optional(),
  reason: z.string().optional(),
});
export type DecisionUse = z.infer<typeof UseSchema>;

const SessionDecisionsSchema = z
  .strictObject({
    off: z.literal(true).optional(),
    use: z.array(UseSchema).max(USES),
    /** Answers by packet key (a hash): reused for the same packet, model and policy. */
    ready: z
      .array(
        z.strictObject({ key: z.string(), at: z.iso.datetime(), evaluation: EvaluationSchema }),
      )
      .max(READY),
  })
  .describe('session decisions');
export type SessionDecisions = z.infer<typeof SessionDecisionsSchema>;

const EMPTY: SessionDecisions = { use: [], ready: [] };

/** What a use keeps of an evaluation. */
const useOf = (e: Evaluation, at: string): DecisionUse => ({
  at,
  site: e.site,
  mode: e.mode,
  status: e.status,
  ...(e.model ? { model: e.model } : {}),
  ...(e.margin === undefined ? {} : { margin: e.margin }),
  latencyMs: e.latencyMs,
  ...(e.cached ? { cached: true } : {}),
  ...(e.reason ? { reason: e.reason } : {}),
});

/** Session `id`'s decision assistance, in `dir`. `id` is a live session's, so never a path. */
export function sessionDecisions(deps: LockDeps & { dir: string }, id: string) {
  const file = join(deps.dir, `${id}.json`);
  const read = (): SessionDecisions => readJson(file, SessionDecisionsSchema) ?? EMPTY;
  const change = (fn: (now: SessionDecisions) => SessionDecisions) =>
    changeJson(file, SessionDecisionsSchema, (now) => fn(now ?? EMPTY), deps);
  const memory: EvaluationMemory = {
    ready: (key) => read().ready.find((r) => r.key === key)?.evaluation,
    note: (evaluation, key) => {
      const at = deps.clock().toISOString();
      const keep = evaluation.status !== 'unavailable' && !evaluation.cached;
      change((now) => ({
        ...now,
        use: [...now.use, useOf(evaluation, at)].slice(-USES),
        ready: keep
          ? [...now.ready.filter((r) => r.key !== key), { key, at, evaluation }].slice(-READY)
          : now.ready,
      }));
    },
  };
  return {
    read,
    memory,
    /** Turns assistance off for this session, or back on; true when it changed. */
    setOff: (off: boolean) => {
      const before = read().off === true;
      change(({ off: _, ...now }) => (off ? { off: true, ...now } : now));
      return before !== off;
    },
  };
}
