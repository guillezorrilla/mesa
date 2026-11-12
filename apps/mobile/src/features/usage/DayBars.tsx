import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { barShares, dayInitial, money } from './usageText';

/** The last days' estimated cost as bars, oldest first, today in the primary tone. */
export function DayBars({ days }: { days: { day: string; cost: number | null }[] }) {
  const shares = barShares(days.map((day) => day.cost));
  return (
    <View className="flex-row items-end gap-1.5">
      {days.map(({ day, cost }, index) => {
        const today = index === days.length - 1;
        return (
          <View
            key={day}
            accessible
            accessibilityLabel={`${day}, ${money(cost)}`}
            className="flex-1 items-center gap-1.5"
          >
            <View className="h-24 w-full justify-end">
              <View
                className={cn('w-full rounded-sm', today ? 'bg-primary' : 'bg-muted-foreground/40')}
                // At least a hairline, so a day with nothing still shows its place.
                style={{ height: `${Math.max(2, (shares[index] ?? 0) * 100)}%` }}
              />
            </View>
            <Text
              className={cn(
                'font-mono text-xs',
                today ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {dayInitial(day)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
