import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { Outgoing } from './useSend';

/** How many of this screen's replies the bar keeps showing, so it never crowds the keyboard. */
const SHOWN = 2;

/** The latest replies sent from this screen, as the person's own bubbles; one still travelling is faint. */
export function SentList({ items }: { items: Outgoing[] }) {
  if (!items.length) return null;
  return (
    <View className="gap-1.5">
      {items.slice(-SHOWN).map((item) => (
        <View
          key={item.key}
          className={cn(
            'max-w-[85%] flex-row items-end gap-2 self-end rounded-2xl rounded-br-sm bg-secondary px-3 py-1.5',
            item.sending && 'opacity-50',
          )}
          accessibilityLabel={`${item.sending ? 'Sending' : 'Sent'}: ${item.text}`}
        >
          <Text className="shrink text-sm text-secondary-foreground" numberOfLines={2}>
            {item.photo ? 'Photo. ' : ''}
            {item.text}
          </Text>
          <Text className="self-end text-xs text-muted-foreground">
            {item.sending ? 'Sending' : 'Sent'}
          </Text>
        </View>
      ))}
    </View>
  );
}
