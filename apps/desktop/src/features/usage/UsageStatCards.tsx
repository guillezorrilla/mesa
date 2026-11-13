import type { UsageReport } from '@mesa/core';
import { excludedNote } from '@mesa/core/browser';
import { Info } from 'lucide-react';
import { Cost } from './Cost';
import { counted } from './format';

const PERIODS = [
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
] as const;

/**
 * Estimated spend today and over the last 7 and 30 local days, each with how many sessions it leaves
 * out, and one line naming them: models with no list price and sessions whose usage was not read.
 */
export function UsageStatCards(props: { report: UsageReport }) {
  const unpriced = props.report.breakdown
    .filter((row) => row.totals.estimatedCostUsd === null && counted(row))
    .map((row) => row.model);
  const unread = props.report.unknown.map((item) => `${item.session} (${item.reason})`);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 divide-x rounded-lg border bg-background">
        {PERIODS.map(([period, label]) => (
          <div key={period} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Cost
              totals={props.report.periods[period]}
              className="mt-0.5 block text-2xl font-semibold tracking-tight"
            />
            {props.report.periods[period].excluded > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {excludedNote(props.report.periods[period].excluded)}
              </p>
            )}
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
