import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * A list group's heading: its mark, its title and how many rows it holds; with `onToggle` a press
 * folds or opens it.
 */
export function GroupHeader({
  mark,
  title,
  count,
  open,
  onToggle,
}: {
  mark?: ReactNode;
  title: string;
  count: number;
  open?: boolean;
  onToggle?: () => void;
}) {
  const row = (
    <View className="flex-row items-center gap-2 bg-background px-4 pt-4 pb-1.5">
      {mark}
      <Text accessibilityRole="header" className="text-sm font-semibold text-muted-foreground">
        {title}
      </Text>
      <Text className="flex-1 text-sm tabular-nums text-muted-foreground/70">{count}</Text>
      {onToggle ? (
        <Icon as={open ? ChevronDown : ChevronRight} className="size-4 text-muted-foreground" />
      ) : null}
    </View>
  );
  if (!onToggle) return row;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count}`}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
    >
      {row}
    </Pressable>
  );
}
