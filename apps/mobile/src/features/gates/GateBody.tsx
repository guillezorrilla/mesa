import { Stack } from 'expo-router';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { AdviceCard } from './AdviceCard';
import { GateOptions } from './GateOptions';
import type { GateRead, Resolved } from './useGate';

/** A decision gate: its question and task, the Decision model's advice, and its options. */
export function GateBody({
  read,
  resolved,
  resolving,
  onPick,
}: {
  read: Promise<GateRead>;
  resolved: Resolved;
  resolving: boolean;
  onPick: (option: string) => void;
}) {
  const { gate, error } = use(read);
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: 'Decision' }} />
      {error ? <ErrorNote text={error} /> : null}
      {gate ? (
        <>
          <Section title={`For task ${gate.task}`}>
            <Text selectable className="text-lg font-medium">
              {gate.question}
            </Text>
          </Section>
          <AdviceCard advice={gate.advice} />
          {resolved.picked ? (
            <Text accessibilityRole="alert">
              You picked {resolved.picked}. The coordinator hears it.
            </Text>
          ) : (
            <GateOptions options={gate.options} busy={resolving} onPick={onPick} />
          )}
          {resolved.error ? <ErrorNote text={resolved.error} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
