import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { streamLines } from '../../lib/file-lines.js';
import { claudeListPrice } from '../../usage/pricing.js';
import { count, type UsageRecord } from '../../usage/records.js';
import { usageLine } from './transcripts.js';

// What Claude Code's transcripts say it charged: the usage ledger's readings (usage/service.ts).

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

/**
 * The usage reading one transcript line holds, if any: an assistant message with its usage.
 * Subagent (sidechain) replies are charges too, inline or in their own transcripts.
 */
export function claudeReading(
  line: string,
  session: string,
  nativeSessionId: string,
): UsageRecord | undefined {
  try {
    const entry = usageLine(line);
    if (!entry || entry === 'compacted') return undefined;
    const { id, timestamp, usage } = entry;
    if (
      typeof id !== 'string' ||
      typeof timestamp !== 'string' ||
      !Number.isFinite(Date.parse(timestamp))
    )
      return undefined;
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
    const model = typeof entry.model === 'string' ? entry.model : undefined;
    const standard =
      (usage.speed === undefined || usage.speed === 'standard') &&
      (usage.service_tier === undefined || usage.service_tier === 'standard') &&
      (usage.inference_geo === undefined || usage.inference_geo === 'not_available');
    return {
      id: `claude:${nativeSessionId}:${id}`,
      session,
      agent: 'claude',
      nativeSessionId,
      ...(model ? { model } : {}),
      at: timestamp,
      source: 'claude-transcript',
      tokens,
      ...(standard
        ? claudeListPrice(model, tokens)
        : { priceVersion: null, estimatedCostUsd: null }),
    };
  } catch {
    // Incomplete native JSONL lines contain no trusted usage record.
    return undefined;
  }
}

/**
 * The charges in `files`, a transcript and its subagents' (claudeUsageFiles). Claude's repeated
 * assistant message IDs are updates to one charge, not additional charges.
 */
export async function claudeUsage(
  files: readonly string[],
  session: string,
  nativeSessionId: string,
) {
  const messages = new Map<string, UsageRecord>();
  for await (const line of streamLines(files)) {
    const reading = claudeReading(line, session, nativeSessionId);
    if (reading) messages.set(reading.id, reading);
  }
  return [...messages.values()];
}
