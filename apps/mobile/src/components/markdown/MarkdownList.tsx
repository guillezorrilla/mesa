import Square from 'lucide-react-native/icons/square';
import SquareCheck from 'lucide-react-native/icons/square-check';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Item } from './markdownNodes';

/** A list's items, each behind its bullet, its number, or its task box (read-only). */
export function MarkdownList({
  items,
  ordered,
  start,
  renderItem,
}: {
  items: Item[];
  ordered: boolean;
  start: number;
  renderItem: (item: Item) => ReactNode;
}) {
  return (
    <View className="gap-1.5">
      {items.map((item, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: an item's place in its list never moves.
        <View key={at} className="flex-row gap-2">
          {item.checked === null ? (
            <Text className="min-w-5 font-mono text-muted-foreground leading-6">
              {ordered ? `${start + at}.` : '•'}
            </Text>
          ) : (
            <View
              className="h-6 justify-center"
              accessible
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
            >
              <Icon
                as={item.checked ? SquareCheck : Square}
                className={item.checked ? 'size-4 text-state-done' : 'size-4 text-muted-foreground'}
              />
            </View>
          )}
          <View className="flex-1">{renderItem(item)}</View>
        </View>
      ))}
    </View>
  );
}
