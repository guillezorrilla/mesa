import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** What an empty list says: its mark in a soft round tile, a title, and one line of why. */
export function EmptyState({
  icon,
  title,
  line,
}: {
  icon: LucideIcon;
  title: string;
  line: string;
}) {
  return (
    <View accessible className="items-center gap-3 px-8 py-12">
      <View className="size-12 items-center justify-center rounded-full bg-muted">
        <Icon as={icon} className="size-5 text-muted-foreground" />
      </View>
      <View className="items-center gap-1">
        <Text className="text-center font-semibold">{title}</Text>
        <Text variant="muted" className="text-center">
          {line}
        </Text>
      </View>
    </View>
  );
}
