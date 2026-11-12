import type { PhoneGate } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';

/** An open decision gate in Needs you: its question and task; it opens the gate to decide. */
export function GateRow({ gate }: { gate: PhoneGate }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Decide: ${gate.question}, for task ${gate.task}`}
      onPress={() => router.push(`/agents/gates/${gate.id}`)}
      className="min-h-16 flex-row items-center gap-3 bg-background px-4 py-3 active:bg-accent"
    >
      <StateDot color="bg-state-waiting" />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2} className="font-semibold">
          {gate.question}
        </Text>
        <Text numberOfLines={1} variant="muted">
          Decision · {gate.task}
        </Text>
      </View>
    </Pressable>
  );
}
