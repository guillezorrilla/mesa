import type { UsageRecord } from './records.js';

/** Published standard Claude API list price, not a Claude Code subscription bill. */
export function claudeListPrice(model: string | undefined, tokens: UsageRecord['tokens']) {
  // https://platform.claude.com/docs/en/models/opus-5-5/overview (2026-09-28).
  if (!model || !/^claude-opus-5-5(?:$|-\d{8}$)/.test(model))
    return { priceVersion: null, estimatedCostUsd: null };
  const { input, output, cacheRead, cacheWrite, cacheWrite5m, cacheWrite1h } = tokens;
  if (
    input === null ||
    output === null ||
    cacheRead === null ||
    cacheWrite === null ||
    cacheWrite5m === null ||
    cacheWrite1h === null ||
    cacheWrite5m + cacheWrite1h !== cacheWrite
  )
    return { priceVersion: null, estimatedCostUsd: null };
  return {
    priceVersion: 'claude-opus-5-5:2026-09-28:standard-api',
    estimatedCostUsd:
      (input * 4 + output * 20 + cacheRead * 0.2 + cacheWrite5m * 5 + cacheWrite1h * 8) / 1_000_000,
  };
}
