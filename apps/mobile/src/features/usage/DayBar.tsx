import type { PhoneUsage } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { dayBarLabel, dayInitial } from './usageText';

/** How a bar stands: the selected day, a day beside it, today with none selected, or another day. */
export type BarTone = 'selected' | 'dimmed' | 'today' | 'plain';

const BAR: Record<BarTone, string> = {
  selected: 'bg-primary',
  today: 'bg-primary',
  dimmed: 'bg-muted-foreground/20',
  plain: 'bg-muted-foreground/40',
};
const INITIAL: Record<BarTone, string> = {
  selected: 'font-semibold text-primary',
  today: 'font-semibold text-foreground',
  dimmed: 'text-muted-foreground',
  plain: 'text-muted-foreground',
};

/**
 * One day's column: its bar at `share` of the chart's height over its weekday's initial. A day
 * that cost something keeps at least a sliver; a day with no cost draws no bar but stays a column
 * a finger or VoiceOver can select.
 */
export function DayBar({
  day,
  share,
  tone,
  onToggle,
}: {
  day: PhoneUsage['days'][number];
  share: number;
  tone: BarTone;
  onToggle: () => void;
}) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={dayBarLabel(day)}
      accessibilityState={{ selected: tone === 'selected' }}
      onAccessibilityTap={onToggle}
      className="flex-1 items-center gap-1.5"
    >
      <View className="h-32 w-full justify-end">
        {(day.cost ?? 0) > 0 ? (
          <View
            className={cn('w-full rounded-sm', BAR[tone])}
            style={{ height: `${share * 100}%`, minHeight: 3 }}
          />
        ) : null}
      </View>
      <Text className={cn('font-mono text-xs', INITIAL[tone])}>{dayInitial(day.day)}</Text>
    </View>
  );
}
