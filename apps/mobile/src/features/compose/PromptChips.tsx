import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** The saved prompts as a row of chips; a tap inserts one into the draft. */
export function PromptChips({
  prompts,
  onPick,
}: {
  prompts: Promise<CallResult<'prompts'>['prompts']>;
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
        <Button
          key={prompt.name}
          size="sm"
          variant="outline"
          className="rounded-full bg-card shadow-none"
          onPress={() => onPick(prompt.text)}
          accessibilityHint="Inserts this saved prompt into your reply"
        >
          <Text className="text-sm font-normal">{prompt.name}</Text>
        </Button>
      ))}
    </ScrollView>
  );
}
