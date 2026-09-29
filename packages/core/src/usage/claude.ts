import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { claudeListPrice } from './pricing.js';
import { count, type UsageRecord } from './records.js';

/** A session's transcript, then its subagents' own beside it: `<id>/subagents/*.jsonl`. */
export function claudeUsageFiles(transcript: string): string[] {
  const folder = join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [transcript];
  }
  const subagents = names.filter((name) => name.endsWith('.jsonl')).sort();
  return [transcript, ...subagents.map((name) => join(folder, name))];
}

async function* lines(files: string[]) {
  for (const file of files)
    yield* createInterface({ input: createReadStream(file), crlfDelay: Infinity });
}

/**
 * Claude's repeated assistant message IDs are updates to one charge, not additional charges.
 * Subagent (sidechain) replies are charges too, inline or in their own transcripts.
 */
export async function claudeUsage(files: string[], session: string, nativeSessionId: string) {
  const messages = new Map<string, UsageRecord>();
  for await (const line of lines(files)) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    try {
      const entry = JSON.parse(line) as {
        type?: unknown;
        timestamp?: unknown;
        message?: { id?: unknown; model?: unknown; usage?: Record<string, unknown> };
      };
      const usage = entry.message?.usage;
      const id = entry.message?.id;
      if (
        entry.type !== 'assistant' ||
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
