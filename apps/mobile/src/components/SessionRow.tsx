import { type PhoneRow, shortAgo } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { StateDot } from './StateDot';
import type { RowAction } from './SwipeRow';

/**
 * One session in a list: its state dot, title (bold while unread), project and state words, how
 * long it has been in that state, its context use, and what it asks while waiting. `stateColor` and `stateWords` come from the
 * caller, so this row knows no domain rules.
 */
export function SessionRow({
  row,
  stateColor,
  stateWords,
  now,
  onPress,
  actions,
}: {
  row: PhoneRow;
  stateColor: string;
  stateWords: string;
  now: number;
  onPress: () => void;
  /** VoiceOver's actions for the row, as the swipe offers them. */
  actions: (RowAction & { name: string })[];
}) {
  const detail = [row.project, stateWords].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[row.title, detail, row.unread && 'unread', row.ask]
        .filter(Boolean)
        .join(', ')}
      accessibilityActions={actions.map(({ name, label }) => ({ name, label }))}
      onAccessibilityAction={(event) =>
        actions.find((a) => a.name === event.nativeEvent.actionName)?.run()
      }
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 bg-background px-4 py-3 active:bg-accent"
    >
      <StateDot color={stateColor} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn(row.unread && 'font-semibold')}>
          {row.title}
        </Text>
        <Text numberOfLines={1} variant="muted">
          {detail}
        </Text>
        {row.ask ? (
          <Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
            {row.ask}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-0.5">
        <Text variant="muted">{shortAgo(row.since, now)}</Text>
        {row.context !== null ? (
          <Text className="font-mono text-xs text-muted-foreground">{row.context}%</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
