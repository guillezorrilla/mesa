import { excludedNote, money, type PhoneDay } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { dayDate } from './usageText';

/**
 * The chart's header readout, as Apple Health's: the selected day's date, its estimated cost large,
 * and what the cost leaves out; with no day selected, how to pick one. It keeps one height, so the
 * bars under it never move.
 */
export function DayReadout({ day }: { day: PhoneDay | null }) {
  if (!day)
    return (
      <View className="h-20 justify-center">
        <Text variant="muted">Tap or drag across the bars to see a day.</Text>
      </View>
    );
  const note = excludedNote(day.excluded);
  return (
    <View className="h-20 justify-center gap-0.5" importantForAccessibility="no-hide-descendants">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {dayDate(day.day)}
      </Text>
      <Text className="font-mono text-3xl font-semibold tracking-tight">{money(day.cost)}</Text>
      {note ? <Text className="text-xs text-muted-foreground">{note}</Text> : null}
    </View>
  );
}
