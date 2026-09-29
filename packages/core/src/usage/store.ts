import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import type { UsageRecord } from './records.js';

const Tokens = z.strictObject({
  input: z.number().int().nonnegative().nullable(),
  output: z.number().int().nonnegative().nullable(),
  cacheRead: z.number().int().nonnegative().nullable(),
  cacheWrite: z.number().int().nonnegative().nullable(),
  cacheWrite5m: z.number().int().nonnegative().nullable(),
  cacheWrite1h: z.number().int().nonnegative().nullable(),
});
const Ledger = z.array(
  z.strictObject({
    id: z.string(),
    session: z.string(),
    agent: z.enum(['claude', 'codex']),
    nativeSessionId: z.string(),
    model: z.string().optional(),
    at: z.iso.datetime(),
    source: z.enum(['claude-transcript', 'codex-rollout']),
    tokens: Tokens,
    priceVersion: z.string().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
  }),
);

/** One small profile-local ledger; repeated native reads replace rows by stable source ID. */
export function usageStore(file: string) {
  const read = (): UsageRecord[] => {
    if (!existsSync(file)) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new MesaError('invalid_config', `${file}: usage ledger is not valid JSON`);
    }
    return parseWith(Ledger, raw, file);
  };
  return {
    read,
    /** ponytail: rewrites the local ledger; use an indexed store if profiles reach huge histories. */
    merge: (fresh: UsageRecord[]) => {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const lock = `${file}.lock`;
      return withLockSync(
        lock,
        () => {
          const old = read();
          const rows = new Map(old.map((row) => [row.id, row]));
          for (const row of fresh) rows.set(row.id, row);
          const merged = [...rows.values()].sort(
            (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
          );
          if (JSON.stringify(old) !== JSON.stringify(merged))
            writeFileAtomic(file, `${JSON.stringify(merged, null, 2)}\n`, 0o600);
          return merged;
        },
        () => lockedBy('usage ledger', lock, 'usage'),
      );
    },
  };
}
