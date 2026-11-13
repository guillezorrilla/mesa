import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * A tab's title as its list's first row, bold and left, with the tab's actions on its right and
 * `below` under it (a search field, a switch); it starts at the same place on every tab and
 * scrolls away with the list.
 */
export function TabHeader({
  title,
  children,
  below,
}: {
  title: string;
  children?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <>
      <View className="min-h-14 flex-row items-center gap-1 px-4 pt-2 pb-1">
        <Text accessibilityRole="header" numberOfLines={1} className="flex-1 text-3xl font-bold">
          {title}
        </Text>
        {children}
      </View>
      {below ? <View className="px-4 pt-1 pb-2">{below}</View> : null}
    </>
  );
}
