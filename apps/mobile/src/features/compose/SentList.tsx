import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { Outgoing } from './useSend';

/** The replies sent from this screen, each marked while it travels to the Mac. */
export function SentList({ items }: { items: Outgoing[] }) {
  if (!items.length) return null;
  return (
    <View className="gap-1">
      {items.map((item) => (
        <Text key={item.key} variant="muted" numberOfLines={2}>
          {item.sending ? 'Sending: ' : 'You: '}
          {item.photo ? '[photo] ' : ''}
          {item.text}
        </Text>
      ))}
    </View>
  );
}
