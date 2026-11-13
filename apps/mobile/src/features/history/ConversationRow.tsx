import type { PhoneConversation } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { conversationAction, conversationDetail } from './historyText';

/** One past conversation: its title, project, agent and age, and what a tap does. */
export function ConversationRow({
  conversation,
  now,
  onPress,
}: {
  conversation: PhoneConversation;
  now: number;
  onPress: () => void;
}) {
  const action = conversationAction(conversation);
  const detail = conversationDetail(conversation, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}, ${detail}`}
      accessibilityHint={conversation.elsewhere ? 'Held by another profile' : action}
      disabled={conversation.elsewhere}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 bg-background px-4 py-3 active:bg-accent"
    >
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{conversation.title}</Text>
        <Text numberOfLines={1} variant="muted">
          {detail}
        </Text>
      </View>
      <Text
        className={cn(
          'text-sm',
          conversation.elsewhere ? 'text-muted-foreground' : 'font-medium text-primary',
        )}
      >
        {action}
      </Text>
    </Pressable>
  );
}
