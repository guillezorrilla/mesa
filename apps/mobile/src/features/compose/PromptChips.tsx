import { use } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';

/** The saved prompts as a row of chips; a tap inserts one into the draft. */
export function PromptChips({
  prompts,
  onPick,
}: {
  prompts: Promise<{ name: string; text: string }[]>;
  onPick: (text: string) => void;
}) {
  const saved = use(prompts);
  if (!saved.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-2"
    >
      {saved.map((prompt) => (
        <Pressable
          key={prompt.name}
          onPress={() => onPick(prompt.text)}
          accessibilityRole="button"
          accessibilityHint="Inserts this saved prompt into your reply"
          className="min-h-9 justify-center rounded-full border border-border bg-card px-3.5 active:bg-accent"
        >
          <Text className="text-sm">{prompt.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
