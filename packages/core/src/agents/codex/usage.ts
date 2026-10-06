import { streamLines } from '../../lib/file-lines.js';
import { count, type UsageRecord } from '../../usage/records.js';

// What Codex's rollouts say it charged: the usage ledger's readings (usage/service.ts).

type Counts = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * The charges in `files`, a rollout alone (its entry's usage.files). Codex token_count totals are
 * cumulative; compaction repeats them without another charge.
 */
export async function codexUsage(
  files: readonly string[],
  session: string,
  nativeSessionId: string,
) {
  const rows: UsageRecord[] = [];
  let previous: Counts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model: string | undefined;
  for await (const line of streamLines(files)) {
    if (!line.includes('"turn_context"') && !line.includes('"token_count"')) continue;
    try {
      const entry = JSON.parse(line) as {
        type?: unknown;
        timestamp?: unknown;
        payload?: {
          type?: unknown;
          model?: unknown;
          info?: { total_token_usage?: Record<string, unknown> };
        };
      };
      if (entry.type === 'turn_context') {
        if (typeof entry.payload?.model === 'string') model = entry.payload.model;
        continue;
      }
      const usage = entry.payload?.info?.total_token_usage;
      if (
        entry.type !== 'event_msg' ||
        entry.payload?.type !== 'token_count' ||
        typeof entry.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(entry.timestamp)) ||
        !usage
      )
        continue;
      const input = count(usage.input_tokens);
      const output = count(usage.output_tokens);
      const cacheRead = count(usage.cached_input_tokens);
      const cacheWrite = count(usage.cache_write_input_tokens);
      if (
        input === null ||
        output === null ||
        cacheRead === null ||
        cacheWrite === null ||
        cacheRead + cacheWrite > input
      )
        continue;
      const total = { input, output, cacheRead, cacheWrite };
      if (
        Object.keys(total).some((key) => total[key as keyof Counts] < previous[key as keyof Counts])
      )
        continue;
      const delta = {
        input:
          input -
          previous.input -
          (cacheRead - previous.cacheRead) -
          (cacheWrite - previous.cacheWrite),
        output: output - previous.output,
        cacheRead: cacheRead - previous.cacheRead,
        cacheWrite: cacheWrite - previous.cacheWrite,
      };
      if (Object.values(delta).some((value) => value < 0)) continue;
      previous = total;
      if (Object.values(delta).every((value) => value === 0)) continue;
      rows.push({
        id: `codex:${nativeSessionId}:${rows.length + 1}`,
        session,
        agent: 'codex',
        nativeSessionId,
        ...(model ? { model } : {}),
        at: entry.timestamp,
        source: 'codex-rollout',
        tokens: { ...delta, cacheWrite5m: null, cacheWrite1h: null },
        priceVersion: null,
        estimatedCostUsd: null,
      });
    } catch {
      // Incomplete native JSONL lines contain no trusted usage record.
    }
  }
  return rows;
}
