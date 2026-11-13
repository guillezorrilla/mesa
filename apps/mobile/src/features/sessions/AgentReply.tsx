import type { ReplySegment as Segment } from '@mesa/core/phone';
import { router } from 'expo-router';
import MessageSquareQuote from 'lucide-react-native/icons/message-square-quote';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ReplySegment } from './ReplySegment';

/** One of the agent's replies, full width: prose as text, each code block copyable, then a quote button. */
export function AgentReply({
  id,
  reply,
  segments,
}: {
  id: string;
  reply: string;
  segments: Segment[];
}) {
  return (
    <View className="gap-3">
      {segments.map((segment, part) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a reply's segments are a fixed cut of its text.
        <ReplySegment key={part} code={segment.code} text={segment.text} />
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 size-8"
        accessibilityLabel="Quote this reply to the agent"
        onPress={() => router.push({ pathname: '/agents/quote', params: { id, reply } })}
      >
        <Icon as={MessageSquareQuote} className="size-4 text-muted-foreground/70" />
      </Button>
    </View>
  );
}
