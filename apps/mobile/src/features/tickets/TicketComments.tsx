import type { PhoneTicketDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Markdown } from '@/components/markdown/Markdown';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';

/** A ticket's newest comments, each with its author and date. */
export function TicketComments({ comments }: { comments: PhoneTicketDetail['comments'] }) {
  if (!comments.length) return null;
  return (
    <Section title="Latest comments">
      {comments.map((c, i) => (
        // In order, never reordered: the index is the comment's place.
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <View key={i} className="gap-1 rounded-xl bg-card p-3">
          <Text variant="muted" className="text-xs">
            {c.author}, {c.at.slice(0, 10)}
          </Text>
          <Markdown text={c.text} />
        </View>
      ))}
    </Section>
  );
}
