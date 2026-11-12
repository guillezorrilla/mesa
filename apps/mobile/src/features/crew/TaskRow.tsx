import type { PhoneTask } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** One task of the graph: its colour, title and words; a task held by a gate opens the gate. */
export function TaskRow({
  task,
  color,
  words,
  first,
}: {
  task: PhoneTask;
  color: string;
  words: string;
  /** The first row of its list draws no hairline above it. */
  first: boolean;
}) {
  const gate = task.gate;
  return (
    <Pressable
      accessibilityRole={gate ? 'button' : 'text'}
      accessibilityLabel={`${task.title}, ${words}`}
      disabled={!gate}
      onPress={() => gate && router.push(`/agents/gates/${gate}`)}
      className={cn(
        'min-h-14 flex-row items-center gap-3 py-3 active:opacity-70',
        !first && 'border-t border-border',
      )}
    >
      <StateDot color={color} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{task.title}</Text>
        <Text variant="muted" className={cn(gate && 'text-state-waiting')}>
          {words}
        </Text>
      </View>
    </Pressable>
  );
}
