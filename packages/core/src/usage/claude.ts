import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { claudeListPrice } from './pricing.js';
import { count, type UsageRecord } from './records.js';

/** Claude's repeated assistant message IDs are updates to one charge, not additional charges. */
export async function claudeUsage(file: string, session: string, nativeSessionId: string) {
  const messages = new Map<string, UsageRecord>();
  for await (const line of createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  })) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    try {
      const entry = JSON.parse(line) as {
        type?: unknown;
        isSidechain?: unknown;
        timestamp?: unknown;
        message?: { id?: unknown; model?: unknown; usage?: Record<string, unknown> };
      };
      const usage = entry.message?.usage;
      const id = entry.message?.id;
      if (
        entry.type !== 'assistant' ||
        entry.isSidechain === true ||
        typeof id !== 'string' ||
        typeof entry.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(entry.timestamp)) ||
        !usage
      )
        continue;
      const cache = usage.cache_creation;
      const split =
        cache && typeof cache === 'object' ? (cache as Record<string, unknown>) : undefined;
      const cacheWrite = count(usage.cache_creation_input_tokens);
      const tokens = {
        input: count(usage.input_tokens),
        output: count(usage.output_tokens),
        cacheRead: count(usage.cache_read_input_tokens),
        cacheWrite,
        cacheWrite5m: split
          ? count(split.ephemeral_5m_input_tokens ?? 0)
          : cacheWrite === 0
            ? 0
            : null,
        cacheWrite1h: split
          ? count(split.ephemeral_1h_input_tokens ?? 0)
          : cacheWrite === 0
            ? 0
            : null,
      };
      const model = typeof entry.message?.model === 'string' ? entry.message.model : undefined;
      const standard =
        (usage.speed === undefined || usage.speed === 'standard') &&
        (usage.service_tier === undefined || usage.service_tier === 'standard') &&
        (usage.inference_geo === undefined || usage.inference_geo === 'not_available');
      messages.set(id, {
        id: `claude:${nativeSessionId}:${id}`,
        session,
        agent: 'claude',
        nativeSessionId,
        ...(model ? { model } : {}),
        at: entry.timestamp,
        source: 'claude-transcript',
        tokens,
        ...(standard
          ? claudeListPrice(model, tokens)
          : { priceVersion: null, estimatedCostUsd: null }),
      });
    } catch {
      // Incomplete native JSONL lines contain no trusted usage record.
    }
  }
  return [...messages.values()];
}
