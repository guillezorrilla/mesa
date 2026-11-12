import type { PhoneTicketDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';

/** A ticket's newest comments, each with its author and date. */
export function TicketComments({ comments }: { comments: PhoneTicketDetail['comments'] }) {
  if (!comments.length) return null;
  return (
    <Section title="Latest comments">
      {comments.map((c) => (
        <View key={`${c.author}:${c.at}`} className="gap-1 rounded-xl bg-card p-3">
          <Text variant="muted" className="text-xs">
            {c.author}, {c.at.slice(0, 10)}
          </Text>
          <Text selectable>{c.text}</Text>
        </View>
      ))}
    </Section>
  );
}
