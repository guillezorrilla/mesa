import { join } from 'node:path';
import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { type Evaluation, type EvaluationMemory, EvaluationSchema } from './evaluate.js';

// A session's decision assistance (CONTEXT.md, Decision assistance): whether the person turned it
// off for this session, its recent use, its ready answers, and when its agent last called the tool
// or was sent advice (what Mesa observed, beside what is configured), in `sessions/decisions/<id>.json`
// beside the session records, never in the vault. Bounded, and it never holds a packet or prompt.

/** How many uses and ready answers the file keeps, the newest. */
const USES = 20;
const READY = 16;

/** One evaluation as the session's use shows it: no packet, no answer text. */
const UseSchema = z.strictObject({
  at: z.iso.datetime(),
  ...EvaluationSchema.pick({
    site: true,
    mode: true,
    status: true,
    model: true,
    margin: true,
    latencyMs: true,
    inputTokens: true,
    costUsd: true,
    cached: true,
    reason: true,
  }).shape,
});
export type DecisionUse = z.infer<typeof UseSchema>;

const SessionDecisionsSchema = z
  .strictObject({
    off: z.literal(true).optional(),
    /** When the agent last called decision_evaluate, and when a hook last sent it advice. */
    seen: z
      .strictObject({ tool: z.iso.datetime().optional(), advice: z.iso.datetime().optional() })
      .optional(),
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
  ...(e.inputTokens === undefined || e.cached ? {} : { inputTokens: e.inputTokens }),
  ...(e.costUsd === undefined || e.cached ? {} : { costUsd: e.costUsd }),
  ...(e.cached ? { cached: true } : {}),
  ...(e.reason ? { reason: e.reason } : {}),
});

/** Session `id`'s file in `dir`, which `mesa rm` removes with its record. */
export const sessionDecisionsFile = (dir: string, id: string) => join(dir, `${id}.json`);

/** Session `id`'s decision assistance, in `dir`. `id` is a live session's, so never a path. */
export function sessionDecisions(deps: LockDeps & { dir: string }, id: string) {
  const file = sessionDecisionsFile(deps.dir, id);
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
    /** Notes that the agent called the tool, or that a hook sent it advice, now. */
    saw: (what: 'tool' | 'advice') => {
      const at = deps.clock().toISOString();
      change((now) => ({ ...now, seen: { ...now.seen, [what]: at } }));
    },
    /** Turns assistance off for this session, or back on; true when it changed. */
    setOff: (off: boolean) => {
      const before = read().off === true;
      change(({ off: _, ...now }) => (off ? { off: true, ...now } : now));
      return before !== off;
    },
  };
}
