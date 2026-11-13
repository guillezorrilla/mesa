import type { PhoneDay } from '@mesa/core/phone';
import type { LayoutRectangle } from 'react-native';
import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { chartScale } from './chartScale';
import { AXIS_WIDTH, DayAxis, PLOT_HEIGHT } from './DayAxis';
import { type BarTone, DayBar } from './DayBar';

/** A bar's tone: the selected day stands out and dims the rest; with none, today does. */
function tone(index: number, last: number, selected: number | null): BarTone {
  if (selected !== null) return index === selected ? 'selected' : 'dimmed';
  return index === last ? 'today' : 'plain';
}

/**
 * The last days' estimated cost as bars on gridlines, oldest first, with the scale on the right.
 * `onBars` hears where the bars lie in the chart's card, so a finger's point picks a day.
 */
export function DayBars({
  days,
  selected,
  onToggle,
  onBars,
}: {
  days: PhoneDay[];
  selected: number | null;
  onToggle: (index: number) => void;
  onBars: (area: LayoutRectangle) => void;
}) {
  const { labels, shares } = chartScale(days.map((day) => day.cost));
  return (
    <View
      className="flex-row"
      onLayout={({ nativeEvent: { layout } }) =>
        onBars({ ...layout, width: layout.width - AXIS_WIDTH })
      }
    >
      <View className="flex-1">
        <View className={cn('absolute inset-x-0 top-0 justify-between', PLOT_HEIGHT)}>
          {[0, 1, 2].map((line) => (
            <View key={line} className="h-px bg-border" />
          ))}
        </View>
        <View className="flex-row gap-1.5">
          {days.map((day, index) => (
            <DayBar
              key={day.day}
              day={day}
              share={shares[index] ?? 0}
              tone={tone(index, days.length - 1, selected)}
              onToggle={() => onToggle(index)}
            />
          ))}
        </View>
      </View>
      <DayAxis labels={labels} />
    </View>
  );
}
