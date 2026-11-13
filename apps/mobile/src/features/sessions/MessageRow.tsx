import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { AgentReply } from './AgentReply';
import type { ChatItem } from './chatItems';
import { GroupLabel } from './GroupLabel';
import { YouBubble } from './YouBubble';

/** One message in the conversation, under its group's label when it opens one. */
export function MessageRow({ id, item, now }: { id: string; item: ChatItem; now: number }) {
  const you = item.from === 'you';
  return (
    <View className={cn('gap-1.5 px-4', item.first ? 'pt-5' : 'pt-1.5')}>
      {item.first ? <GroupLabel you={you} at={item.at} now={now} /> : null}
      {you ? (
        <YouBubble text={item.segments.map((s) => s.text).join('\n')} sending={item.sending} />
      ) : (
        <AgentReply id={id} reply={item.reply ?? ''} segments={item.segments} />
      )}
    </View>
  );
}
