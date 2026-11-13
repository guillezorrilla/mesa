import type { PhoneDraft } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { commentPlace } from './prText';

/** My Pending drafts, which only I see until I submit them, each with Discard. */
export function DraftsSection({
  drafts,
  onDiscard,
}: {
  drafts: PhoneDraft[];
  onDiscard: (draft: PhoneDraft) => void;
}) {
  if (!drafts.length) return null;
  return (
    <Section title="Your drafts">
      {drafts.map((draft) => (
        <View key={draft.id} className="gap-2 rounded-xl border border-dashed border-border p-4">
          <Text className="font-mono text-xs text-muted-foreground">{commentPlace(draft)}</Text>
          <Text selectable>{draft.body}</Text>
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            accessibilityLabel={`Discard the draft on ${commentPlace(draft)}`}
            onPress={() => onDiscard(draft)}
          >
            <Text className="text-destructive">Discard</Text>
          </Button>
        </View>
      ))}
    </Section>
  );
}
