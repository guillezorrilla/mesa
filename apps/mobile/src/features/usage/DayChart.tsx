import type { PhoneDay } from '@mesa/core/phone';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { DayBars } from './DayBars';
import { DayModels } from './DayModels';
import { DayReadout } from './DayReadout';
import { useDaySelection } from './useDaySelection';

/** The last days' cost as a chart a finger reads: the selected day's readout, the bars, its models. */
export function DayChart({ days }: { days: PhoneDay[] }) {
  const { selected, toggle, gesture, onBars } = useDaySelection(days.length);
  const day = selected === null ? null : (days[selected] ?? null);
  return (
    <GestureDetector gesture={gesture}>
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <DayReadout day={day} />
        <DayBars days={days} selected={selected} onToggle={toggle} onBars={onBars} />
        {day ? <DayModels models={day.models} /> : null}
      </View>
    </GestureDetector>
  );
}
