import { use, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { shownText } from './stepWords';

/**
 * A step's whole text, read when its row opened (`read`), in orca's code box: mono, scrolled
 * sideways, its first lines until "Show all".
 */
export function StepText({ read }: { read: Promise<{ text: string } | { error: string }> }) {
  const answer = use(read);
  const [all, setAll] = useState(false);
  if ('error' in answer) return <Text className="text-sm text-destructive">{answer.error}</Text>;
  const shown = shownText(answer.text, all);
  return (
    <View className="gap-1.5">
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="p-2.5"
        >
          <Text selectable className="font-mono text-xs leading-[17px]">
            {shown.text || 'No output.'}
          </Text>
        </ScrollView>
      </View>
      {shown.more ? (
        <Pressable
          onPress={() => setAll(true)}
          accessibilityRole="button"
          className="self-start rounded-full border border-border bg-secondary px-3 py-1 active:opacity-70"
        >
          <Text className="text-xs font-semibold">Show all, {shown.more} more lines</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
