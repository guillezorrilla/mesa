/** One native provider usage reading, tied to a Mesa session without copying prompt content. */
export type UsageRecord = {
  id: string;
  session: string;
  agent: 'claude' | 'codex';
  nativeSessionId: string;
  model?: string;
  at: string;
  source: 'claude-transcript' | 'codex-rollout';
  tokens: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    cacheWrite5m: number | null;
    cacheWrite1h: number | null;
  };
  priceVersion: string | null;
  estimatedCostUsd: number | null;
};

export type UsageReport = {
  rows: UsageRecord[];
  unknown: { session: string; reason: string }[];
  periods: Record<'today' | '7d' | '30d' | '90d' | 'month', UsageTotals>;
  alerts: { period: 'today' | '7d' | 'month'; thresholdUsd: number; knownCostUsd: number }[];
  /** Each UTC day of the last 90, with its totals split by provider and model. */
  daily: { day: string; totals: UsageTotals; models: UsageBreakdown }[];
  breakdown: UsageBreakdown;
};

export type UsageBreakdown = {
  agent: UsageRecord['agent'];
  model: string;
  totals: UsageTotals;
}[];

export type UsageTotals = {
  events: number;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  estimatedCostUsd: number | null;
};

export const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
