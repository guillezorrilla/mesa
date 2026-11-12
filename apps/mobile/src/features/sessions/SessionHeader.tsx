import { type PhoneRow, relativeAgo } from '@mesa/core/phone';
import { View } from 'react-native';
import { ContextRing } from '@/components/ContextRing';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { stateColor, stateWords } from './sessionState';

/** A session's state, since when, its project, and how full its context window is. */
export function SessionHeader({ row, now }: { row: PhoneRow; now: number }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <StateDot color={stateColor(row.state, row.unread)} />
          <Text className="font-medium">{stateWords(row.state)}</Text>
          <Text variant="muted">{relativeAgo(row.since, now)}</Text>
        </View>
        {row.project ? <Text variant="muted">{row.project}</Text> : null}
      </View>
      {row.context !== null ? <ContextRing percent={row.context} /> : null}
    </View>
  );
}
