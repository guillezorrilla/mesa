import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { UsageRecord } from './records.js';

const Tokens = z.strictObject({
  input: z.number().int().nonnegative().nullable(),
  output: z.number().int().nonnegative().nullable(),
  cacheRead: z.number().int().nonnegative().nullable(),
  cacheWrite: z.number().int().nonnegative().nullable(),
  cacheWrite5m: z.number().int().nonnegative().nullable(),
  cacheWrite1h: z.number().int().nonnegative().nullable(),
});
const Rows = z.array(
  z.strictObject({
    id: z.string(),
    session: z.string(),
    agent: AgentSchema,
    nativeSessionId: z.string(),
    model: z.string().optional(),
    at: z.iso.datetime(),
    source: z.enum(['claude-transcript', 'codex-rollout']),
    tokens: Tokens,
    priceVersion: z.string().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
  }),
);
const Source = z.strictObject({
  session: z.string(),
  nativeSessionId: z.string(),
  file: z.string(),
  size: z.number().int(),
  mtimeMs: z.number(),
  reader: z.number().int().positive(),
});
export type SourceStamp = z.infer<typeof Source>;
export const HookStampSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  nativeIds: z.array(z.string()),
  changedIds: z.array(z.string()),
});
export type HookStamp = z.infer<typeof HookStampSchema>;
const Ledger = z.strictObject({
  rows: Rows,
  sources: z.record(z.string(), Source),
  hooks: z.record(z.string(), HookStampSchema).default({}),
});
type Ledger = z.infer<typeof Ledger>;
// Earlier P4 ledgers were arrays; preserve their rows and scan sources once to add stamps.
const LedgerFile = z
  .union([Ledger, Rows.transform((rows): Ledger => ({ rows, sources: {}, hooks: {} }))])
  .describe('usage ledger');
const EMPTY: Ledger = { rows: [], sources: {}, hooks: {} };

/** One profile-local ledger; unchanged native files keep their normalized rows. */
export function usageStore(file: string, deps: LockDeps) {
  const read = (): Ledger => readJson(file, LedgerFile) ?? EMPTY;
  return {
    read,
    /** ponytail: rewrites the local ledger; use an indexed store if profiles reach huge histories. */
    merge: (
      fresh: UsageRecord[],
      sources: Record<string, SourceStamp>,
      hooks: Record<string, HookStamp>,
    ) => {
      let merged: UsageRecord[] = [];
      changeJson(
        file,
        LedgerFile,
        (old = EMPTY) => {
          const rows = new Map(old.rows.map((row) => [row.id, row]));
          for (const row of fresh) rows.set(row.id, row);
          merged = [...rows.values()].sort(
            (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
          );
          const nextHooks = { ...old.hooks };
          for (const [id, hook] of Object.entries(hooks)) {
            const prior = nextHooks[id];
            nextHooks[id] = {
              offset: Math.max(prior?.offset ?? 0, hook.offset),
              nativeIds: [...new Set([...(prior?.nativeIds ?? []), ...hook.nativeIds])],
              changedIds: [...new Set([...(prior?.changedIds ?? []), ...hook.changedIds])],
            };
          }
          return { rows: merged, sources: { ...old.sources, ...sources }, hooks: nextHooks };
        },
        deps,
      );
      return merged;
    },
  };
}
