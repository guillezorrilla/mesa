import { money } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** Today's estimated cost large, with the last 7 days and this month beside it. */
export function CostTiles({
  today,
  week,
  month,
}: {
  today: number | null;
  week: number | null;
  month: number | null;
}) {
  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-5">
      <View accessible className="gap-1">
        <Text variant="muted">Today</Text>
        <Text className="font-mono text-5xl font-semibold tracking-tight">{money(today)}</Text>
      </View>
      <View className="flex-row gap-4 border-t border-border pt-4">
        {(
          [
            ['Last 7 days', week],
            ['This month', month],
          ] as const
        ).map(([label, cost]) => (
          <View key={label} accessible className="flex-1 gap-1">
            <Text variant="muted">{label}</Text>
            <Text className="font-mono text-xl">{money(cost)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
