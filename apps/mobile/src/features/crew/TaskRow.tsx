import type { PhoneTask } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';

/** One task of the graph: its colour, title and words; a task held by a gate opens the gate. */
export function TaskRow({ task, color, words }: { task: PhoneTask; color: string; words: string }) {
  const gate = task.gate;
  return (
    <Pressable
      accessibilityRole={gate ? 'button' : 'text'}
      accessibilityLabel={`${task.title}, ${words}`}
      disabled={!gate}
      onPress={() => gate && router.push(`/agents/gates/${gate}`)}
      className="flex-row items-center gap-3 py-2 active:opacity-70"
    >
      <StateDot color={color} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{task.title}</Text>
        <Text variant="muted" className={gate ? 'text-state-waiting' : undefined}>
          {words}
        </Text>
      </View>
    </Pressable>
  );
}
