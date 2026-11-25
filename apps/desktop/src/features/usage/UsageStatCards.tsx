import type { UsageReport } from '@mesa/core';
import { excludedNote, counted as sessions } from '@mesa/core/browser';
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
 * out, and one line naming them: models with no list price, and how many sessions were not read,
 * by reason.
 */
export function UsageStatCards(props: { report: UsageReport }) {
  const unpriced = props.report.breakdown
    .filter((row) => row.totals.estimatedCostUsd === null && counted(row))
    .map((row) => row.model);
  // A count per reason, not every id: a month can leave out hundreds of sessions.
  const reasons = new Map<string, number>();
  for (const { reason } of props.report.unknown)
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const unread = [...reasons].map(([reason, n]) => `${sessions(n, 'session')} (${reason})`);
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
            <p className="mt-0.5 text-xs text-muted-foreground empty:hidden">
              {excludedNote(props.report.periods[period].excluded)}
            </p>
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
