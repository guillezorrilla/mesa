import { excludedNote, money } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type Period = { cost: number | null; excluded: number };

/** One period's estimated cost, with a quiet note under it when the cost leaves sessions out. */
function PeriodCost({
  label,
  cost,
  excluded,
  className,
  costClassName,
}: Period & { label: string; className?: string; costClassName: string }) {
  const note = excludedNote(excluded);
  return (
    <View accessible className={cn('gap-1', className)}>
      <Text variant="muted">{label}</Text>
      <Text className={cn('font-mono', costClassName)}>{money(cost)}</Text>
      {note ? <Text className="text-xs text-muted-foreground">{note}</Text> : null}
    </View>
  );
}

/** Today's estimated cost large, with the last 7 days and this month beside it. */
export function CostTiles({ today, week, month }: Record<'today' | 'week' | 'month', Period>) {
  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-5">
      <PeriodCost label="Today" costClassName="text-5xl font-semibold tracking-tight" {...today} />
      <View className="flex-row gap-4 border-t border-border pt-4">
        <PeriodCost label="Last 7 days" className="flex-1" costClassName="text-xl" {...week} />
        <PeriodCost label="This month" className="flex-1" costClassName="text-xl" {...month} />
      </View>
    </View>
  );
}
