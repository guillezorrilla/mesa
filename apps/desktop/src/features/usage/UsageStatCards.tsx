import type { UsageReport } from '@mesa/core';
import { Info } from 'lucide-react';
import { Cost } from './Cost';
import { counted, knownCost } from './format';

const PERIODS = [
  ['today', 'Today', 1],
  ['7d', 'Last 7 days', 7],
  ['30d', 'Last 30 days', 30],
] as const;

/**
 * Estimated spend today and over the last 7 and 30 UTC days, and one line naming what the totals
 * leave out: models with no list price and sessions whose usage could not be read.
 */
export function UsageStatCards(props: { report: UsageReport }) {
  const unpriced = props.report.breakdown
    .filter((row) => row.totals.estimatedCostUsd === null && counted(row))
    .map((row) => row.model);
  const unread = props.report.unknown.map((item) => `${item.session} (${item.reason})`);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 divide-x rounded-lg border bg-background">
        {PERIODS.map(([period, label, days]) => (
          <div key={period} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Cost
              value={props.report.periods[period].estimatedCostUsd}
              known={knownCost(props.report.daily.slice(-days).flatMap((day) => day.models))}
              className="mt-0.5 block text-2xl font-semibold tracking-tight"
            />
          </div>
        ))}
      </div>
      {(unpriced.length > 0 || unread.length > 0) && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            Totals cover priced usage only.
            {unpriced.length > 0 && ` No list price: ${unpriced.join(', ')}.`}
            {unread.length > 0 && ` Not read: ${unread.join(', ')}.`}
          </span>
        </p>
      )}
    </div>
  );
}
