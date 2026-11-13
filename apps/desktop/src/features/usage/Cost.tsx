import type { UsageTotals } from '@mesa/core';
import { excludedNote, money } from '@mesa/core/browser';
import { cn } from '@/lib/utils';

/**
 * An estimate in dollars. When it leaves sessions out (no list price, or not read), the priced part
 * shows with a `+`; when none of it is priced, a quiet n/a.
 */
export function Cost(props: {
  totals: Pick<UsageTotals, 'estimatedCostUsd' | 'excluded'>;
  className?: string;
}) {
  const { estimatedCostUsd: value, excluded } = props.totals;
  if (value === null)
    return (
      <span
        className={cn('font-normal text-muted-foreground', props.className)}
        title="Not priced: no list price, or usage not read"
      >
        n/a
      </span>
    );
  return (
    <span
      className={cn('tabular-nums', props.className)}
      title={excluded > 0 ? `Priced usage only: ${excludedNote(excluded)}` : undefined}
    >
      {money(value)}
      {excluded > 0 && <span className="text-muted-foreground">+</span>}
    </span>
  );
}
