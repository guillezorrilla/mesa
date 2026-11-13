import { type PhonePr, shortAgo } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { bucketColor, prMeta } from './prText';

/** One PR in the queue: its bucket's dot, title, project, number and author, and its age. */
export function PrRow({ pr, now, onPress }: { pr: PhonePr; now: number; onPress: () => void }) {
  const meta = prMeta(pr);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pr.title}, ${meta}`}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 bg-background px-4 py-3 active:bg-accent"
    >
      <StateDot color={bucketColor(pr.bucket)} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{pr.title}</Text>
        <Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
          {meta}
        </Text>
      </View>
      <Text variant="muted">{shortAgo(pr.updatedAt, now)}</Text>
    </Pressable>
  );
}
