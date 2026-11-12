import { type PhoneDetail, relativeAgo } from '@mesa/core/phone';
import { router } from 'expo-router';
import MessageSquareQuote from 'lucide-react-native/icons/message-square-quote';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ReplySegment } from './ReplySegment';

/**
 * The session's latest replies, newest first, prose as text and each code block copyable, each
 * with a way to quote a passage of it to the agent.
 */
export function ReplyList({
  id,
  replies,
  now,
}: {
  id: string;
  replies: PhoneDetail['replies'];
  now: number;
}) {
  if (!replies.length) return <Text variant="muted">No replies yet.</Text>;
  return (
    <View className="gap-6">
      {replies.map((reply) => (
        <View key={reply.id} className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="muted">{reply.at ? relativeAgo(reply.at, now) : ''}</Text>
            <Button
              variant="ghost"
              size="sm"
              accessibilityLabel="Quote this reply to the agent"
              onPress={() =>
                router.push({ pathname: '/agents/quote', params: { id, reply: reply.id } })
              }
            >
              <Icon as={MessageSquareQuote} className="size-4 text-muted-foreground" />
              <Text>Quote</Text>
            </Button>
          </View>
          {reply.segments.map((segment, part) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a reply's segments are a fixed cut of its text.
            <ReplySegment key={part} code={segment.code} text={segment.text} />
          ))}
        </View>
      ))}
    </View>
  );
}
