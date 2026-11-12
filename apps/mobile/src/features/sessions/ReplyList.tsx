import { type PhoneDetail, relativeAgo } from '@mesa/core/phone';
import { View } from 'react-native';
import { CodeBlock } from '@/components/CodeBlock';
import { Text } from '@/components/ui/text';

/** The session's latest replies, newest first, prose as text and each code block copyable. */
export function ReplyList({ replies, now }: { replies: PhoneDetail['replies']; now: number }) {
  if (!replies.length) return <Text variant="muted">No replies yet.</Text>;
  return (
    <View className="gap-6">
      {replies.map((reply) => (
        <View key={reply.id} className="gap-3">
          {reply.at ? <Text variant="muted">{relativeAgo(reply.at, now)}</Text> : null}
          {reply.segments.map((segment, part) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a reply's segments are a fixed cut of its text.
            <Segment key={part} code={segment.code} text={segment.text} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Prose as selectable text, code as a block with its copy button. */
function Segment({ code, text }: { code: boolean; text: string }) {
  return code ? <CodeBlock code={text} /> : <Text selectable>{text}</Text>;
}
