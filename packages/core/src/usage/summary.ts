import type { UsageRecord, UsageReport, UsageTotals } from './records.js';

function totals(rows: UsageRecord[]): UsageTotals {
  const sum = (read: (row: UsageRecord) => number | null) =>
    rows.some((row) => read(row) === null)
      ? null
      : rows.reduce((total, row) => total + (read(row) ?? 0), 0);
  return {
    events: rows.length,
    input: sum((row) => row.tokens.input),
    output: sum((row) => row.tokens.output),
    cacheRead: sum((row) => row.tokens.cacheRead),
    cacheWrite: sum((row) => row.tokens.cacheWrite),
    estimatedCostUsd: sum((row) => row.estimatedCostUsd),
  };
}

/** UTC buckets make CLI and desktop agree; unknown readings keep aggregates unknown. */
export function summarizeUsage(
  rows: UsageRecord[],
  now: Date,
): Pick<UsageReport, 'periods' | 'daily' | 'breakdown'> {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const period = (days: number) =>
    totals(
      rows.filter((row) => {
        const at = Date.parse(row.at);
        return at >= today - (days - 1) * 86_400_000 && at <= now.getTime();
      }),
    );
  const recent = rows.filter((row) => {
    const at = Date.parse(row.at);
    return at >= today - 89 * 86_400_000 && at <= now.getTime();
  });
  const byDay = new Map<string, UsageRecord[]>();
  const byModel = new Map<string, UsageRecord[]>();
  for (const row of recent) {
    const day = row.at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
    const key = `${row.agent}\0${row.model ?? 'unknown model'}`;
    byModel.set(key, [...(byModel.get(key) ?? []), row]);
  }
  return {
    periods: {
      today: period(1),
      '7d': period(7),
      '30d': period(30),
      '90d': period(90),
      month: totals(
        rows.filter((row) => {
          const at = Date.parse(row.at);
          return at >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) && at <= now.getTime();
        }),
      ),
    },
    daily: Array.from({ length: 90 }, (_, index) => {
      const day = new Date(today - (89 - index) * 86_400_000).toISOString().slice(0, 10);
      return { day, totals: totals(byDay.get(day) ?? []) };
    }),
    breakdown: [...byModel].map(([key, found]) => {
      const [agent, model = 'unknown model'] = key.split('\0');
      return { agent: agent as UsageRecord['agent'], model, totals: totals(found) };
    }),
  };
}
