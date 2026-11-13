import { localDay } from '../lib/time.js';
import type { UsageBreakdown, UsageRecord, UsageReport, UsageTotals } from './records.js';

/**
 * Rows summed, each field over the rows that know it. `unknown` names sessions whose usage could
 * not be read; with the sessions of unpriced rows they make `excluded`. A field is null only when
 * no row knows it and something is excluded.
 */
export function usageTotals(rows: UsageRecord[], unknown: readonly string[] = []): UsageTotals {
  const excluded = new Set(unknown);
  for (const row of rows) if (row.estimatedCostUsd === null) excluded.add(row.session);
  const sum = (read: (row: UsageRecord) => number | null) => {
    let total: number | null = null;
    for (const row of rows) {
      const value = read(row);
      if (value !== null) total = (total ?? 0) + value;
    }
    return total ?? (excluded.size ? null : 0);
  };
  return {
    events: rows.length,
    input: sum((row) => row.tokens.input),
    output: sum((row) => row.tokens.output),
    cacheRead: sum((row) => row.tokens.cacheRead),
    cacheWrite: sum((row) => row.tokens.cacheWrite),
    estimatedCostUsd: sum((row) => row.estimatedCostUsd),
    excluded: excluded.size,
  };
}

/** Rows split by provider and model, in first-seen order. */
function byModel(rows: UsageRecord[]): UsageBreakdown {
  const buckets = new Map<string, UsageRecord[]>();
  for (const row of rows) {
    const key = `${row.agent}\0${row.model ?? 'unknown model'}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets].map(([key, found]) => {
    const [agent, model = 'unknown model'] = key.split('\0');
    return { agent: agent as UsageRecord['agent'], model, totals: usageTotals(found) };
  });
}

/**
 * Local calendar days, as `mesa daily` reads them: a day starts at local midnight, so one around a
 * DST change is 23 or 25 hours. A span sums what it knows; `unknown` sessions it overlaps count in its
 * `excluded`.
 */
export function summarizeUsage(
  rows: UsageRecord[],
  now: Date,
  unknown: readonly { id: string; startedAt: string; endedAt?: string }[] = [],
): Pick<UsageReport, 'periods' | 'daily' | 'breakdown' | 'agents'> {
  /** When the local day `back` days before today starts. */
  const dayStart = (back: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime();
  const totals = (found: UsageRecord[], from: number, until = now.getTime()) =>
    usageTotals(
      found,
      unknown
        .filter(
          (session) =>
            Date.parse(session.startedAt) < until &&
            (!session.endedAt || Date.parse(session.endedAt) > from),
        )
        .map((session) => session.id),
    );
  const since = (from: number) =>
    totals(
      rows.filter((row) => {
        const at = Date.parse(row.at);
        return at >= from && at <= now.getTime();
      }),
      from,
    );
  const recent = rows.filter((row) => {
    const at = Date.parse(row.at);
    return at >= dayStart(89) && at <= now.getTime();
  });
  const byDay = new Map<string, UsageRecord[]>();
  for (const row of recent) {
    const day = localDay(new Date(row.at));
    const bucket = byDay.get(day);
    if (bucket) bucket.push(row);
    else byDay.set(day, [row]);
  }
  return {
    periods: {
      today: since(dayStart(0)),
      '7d': since(dayStart(6)),
      '30d': since(dayStart(29)),
      '90d': since(dayStart(89)),
      month: since(new Date(now.getFullYear(), now.getMonth(), 1).getTime()),
    },
    daily: Array.from({ length: 90 }, (_, index) => {
      const start = dayStart(89 - index);
      const day = localDay(new Date(start));
      const found = byDay.get(day) ?? [];
      return {
        day,
        totals: totals(found, start, Math.min(dayStart(88 - index), now.getTime())),
        models: byModel(found),
      };
    }),
    breakdown: byModel(recent),
    agents: [...new Set(recent.map((row) => row.agent))].map((agent) => ({
      agent,
      totals: usageTotals(recent.filter((row) => row.agent === agent)),
    })),
  };
}
