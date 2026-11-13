import type { PhoneToday } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { plainText } from './noteBlocks';
import { VaultList } from './VaultList';
import { costText, kindWord } from './vaultText';

/** The Weekly Rewind: its seven days, sessions ended and cost, its notes, and what is missing. */
export function RewindSection({ rewind }: { rewind: PhoneToday['rewind'] }) {
  return (
    <Section title="Weekly Rewind">
      <View accessible className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="font-mono text-sm">
          {rewind.from} to {rewind.through}
        </Text>
        <Text variant="muted">
          {rewind.ended} ended · {costText(rewind.costUsd)}
        </Text>
      </View>
      <VaultList
        items={rewind.notes.map((note) => ({
          key: note.path,
          title: plainText(note.summary),
          stamp: kindWord(note.kind),
          path: note.path,
        }))}
      />
      {rewind.missing.map((item) => (
        <Text key={item} variant="muted">
          Missing: {item}
        </Text>
      ))}
    </Section>
  );
}
