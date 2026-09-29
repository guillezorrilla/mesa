import type { UsageRecord } from './records.js';

/**
 * Standard Claude API list prices in USD per million tokens. Cache writes cost 1.25x input for
 * 5 minutes and 2x for 1 hour on every model. Opus 5.5 from
 * https://platform.claude.com/docs/en/models/opus-5-5/overview (2026-09-28), which reproduces
 * Claude Code's own costUSD; the others from the claude-api skill's model table and
 * prompt-caching economics (cached 2026-09-25): cache reads 0.1x input unless a model lists its own.
 */
const PRICES = new Map<
  string,
  { input: number; output: number; cacheRead: number; version: string }
>(
  (
    [
      ['claude-fable-5-1', 10, 50, 0.25, '2026-09-25'],
      ['claude-mythos-5-1', 10, 50, 0.25, '2026-09-25'],
      ['claude-fable-5', 10, 50, 1, '2026-09-25'],
      ['claude-opus-5-5', 4, 20, 0.2, '2026-09-28'],
      ['claude-opus-5', 5, 25, 0.5, '2026-09-25'],
      ['claude-opus-4-8', 5, 25, 0.5, '2026-09-25'],
      ['claude-opus-4-7', 5, 25, 0.5, '2026-09-25'],
      ['claude-opus-4-6', 5, 25, 0.5, '2026-09-25'],
      ['claude-sonnet-5-5', 2, 10, 0.2, '2026-09-25'],
      ['claude-sonnet-5', 2, 10, 0.2, '2026-09-25'],
      ['claude-sonnet-4-6', 3, 15, 0.3, '2026-09-25'],
      ['claude-haiku-4-5', 1, 5, 0.1, '2026-09-25'],
    ] as const
  ).map(([model, input, output, cacheRead, asOf]) => [
    model,
    { input, output, cacheRead, version: `${model}:${asOf}:standard-api` },
  ]),
);

/** Published standard Claude API list price, not a Claude Code subscription bill. */
export function claudeListPrice(model: string | undefined, tokens: UsageRecord['tokens']) {
  // A dated snapshot id (claude-haiku-4-5-20251001) has its alias's price.
  const price = model ? PRICES.get(model.replace(/-\d{8}$/, '')) : undefined;
  if (!price) return { priceVersion: null, estimatedCostUsd: null };
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
    priceVersion: price.version,
    estimatedCostUsd:
      (input * price.input +
        output * price.output +
        cacheRead * price.cacheRead +
        cacheWrite5m * price.input * 1.25 +
        cacheWrite1h * price.input * 2) /
      1_000_000,
  };
}
