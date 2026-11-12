import { Stack } from 'expo-router';
import { use } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { AdviceCard } from './AdviceCard';
import { GateDecision } from './GateDecision';
import type { GateRead } from './useGate';

/** A decision gate: its task and question, the Decision model's advice, and its options. */
export function GateBody({ read }: { read: Promise<GateRead> }) {
  const { gate, error } = use(read);
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: 'Decision' }} />
      {error ? <ErrorNote text={error} /> : null}
      {gate ? (
        <>
          <View className="gap-2">
            <Text variant="muted" numberOfLines={2}>
              For task {gate.task}
            </Text>
            <Text selectable accessibilityRole="header" className="text-2xl font-semibold">
              {gate.question}
            </Text>
          </View>
          <AdviceCard advice={gate.advice} />
          <GateDecision id={gate.id} options={gate.options} advice={gate.advice} />
        </>
      ) : null}
    </Screen>
  );
}
