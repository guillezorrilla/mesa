import { costAlertText } from '../../usage/alert.js';
import type { UsageReport } from '../../usage/records.js';
import type { PhoneRow } from '../protocol/rpc.js';
import type { PhoneUsage } from '../protocol/usage.js';

/** How many days and sessions the phone shows. */
const DAYS = 14;
const SESSIONS = 40;
const MODELS = 3;

/** Costliest first, an unknown cost last. */
const byCost = (a: { cost: number | null }, b: { cost: number | null }) =>
  (b.cost ?? -1) - (a.cost ?? -1);

/** Each session's summed estimated cost; null for one with a reading that has no price. */
function costBySession(report: Pick<UsageReport, 'rows' | 'unknown'>) {
  const costs = new Map<string, number | null>();
  for (const row of report.rows) {
    const sum = costs.get(row.session);
    costs.set(
      row.session,
      sum === null || row.estimatedCostUsd === null ? null : (sum ?? 0) + row.estimatedCostUsd,
    );
  }
  for (const { session } of report.unknown) costs.set(session, null);
  return costs;
}

/**
 * `mesa usage`'s report cut for the phone (#1067): the periods, the last 14 days with each day's
 * costliest models (#1144), and each session on the board with its cost and context, costliest
 * first (unknown cost last).
 */
export function phoneUsage(report: UsageReport, rows: readonly PhoneRow[]): PhoneUsage {
  const costs = costBySession(report);
  const sessions = rows.map((row) => ({
    id: row.id,
    title: row.title,
    project: row.project,
    cost: costs.has(row.id) ? (costs.get(row.id) ?? null) : 0,
    context: row.context,
  }));
  sessions.sort(byCost);
  return {
    today: report.periods.today.estimatedCostUsd,
    week: report.periods['7d'].estimatedCostUsd,
    month: report.periods.month.estimatedCostUsd,
    excluded: {
      today: report.periods.today.excluded,
      week: report.periods['7d'].excluded,
      month: report.periods.month.excluded,
    },
    days: report.daily.slice(-DAYS).map(({ day, totals, models }) => ({
      day,
      cost: totals.estimatedCostUsd,
      excluded: totals.excluded,
      models: models
        .map(({ model, totals }) => ({ model, cost: totals.estimatedCostUsd }))
        .sort(byCost)
        .slice(0, MODELS),
    })),
    sessions: sessions.slice(0, SESSIONS),
    alerts: report.alerts.map(costAlertText),
  };
}
