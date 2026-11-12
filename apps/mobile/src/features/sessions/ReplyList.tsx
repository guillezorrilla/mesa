import { type PhoneDetail, relativeAgo } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ReplySegment } from './ReplySegment';

/** The session's latest replies, newest first, prose as text and each code block copyable. */
export function ReplyList({ replies, now }: { replies: PhoneDetail['replies']; now: number }) {
  if (!replies.length) return <Text variant="muted">No replies yet.</Text>;
  return (
    <View className="gap-6">
      {replies.map((reply) => (
        // Two replies with the same text share a revision, so the time tells them apart.
        <View key={`${reply.id}:${reply.at}`} className="gap-3">
          {reply.at ? <Text variant="muted">{relativeAgo(reply.at, now)}</Text> : null}
          {reply.segments.map((segment, part) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a reply's segments are a fixed cut of its text.
            <ReplySegment key={part} code={segment.code} text={segment.text} />
          ))}
        </View>
      ))}
    </View>
  );
}
