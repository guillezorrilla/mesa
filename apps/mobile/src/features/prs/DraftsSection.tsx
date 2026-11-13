import { commentPlace, type PhoneDraft } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** My Pending drafts, which only I see until I submit them, each with Discard. */
export function DraftsSection({
  drafts,
  onDiscard,
  busy,
}: {
  drafts: PhoneDraft[];
  onDiscard: (draft: PhoneDraft) => void;
  busy: boolean;
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
            disabled={busy}
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
