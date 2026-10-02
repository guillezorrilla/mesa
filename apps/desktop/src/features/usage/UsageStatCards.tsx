import type { UsageReport } from '@mesa/core';
import { Cpu, DollarSign, TrendingUp } from 'lucide-react';
import { money } from './format';

const CARDS = [
  ['today', 'Today', DollarSign, 'text-state-idle'],
  ['7d', 'Last 7 days', TrendingUp, 'text-state-working'],
  ['30d', 'Last 30 days', Cpu, 'text-state-waiting'],
] as const;

/** Estimated spend today and over the last 7 and 30 UTC days. */
export function UsageStatCards(props: { periods: UsageReport['periods'] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CARDS.map(([period, label, Icon, tone]) => (
        <div key={period} className="rounded-lg border bg-background p-3">
          <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Icon aria-hidden className={`size-3.5 ${tone}`} />
            {label}
          </p>
          <p className="text-lg font-semibold">{money(props.periods[period].estimatedCostUsd)}</p>
        </div>
      ))}
    </div>
  );
}
