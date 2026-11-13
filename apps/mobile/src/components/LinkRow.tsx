import type { LucideIcon } from 'lucide-react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** A card that opens another screen: its mark, its name and one line of what it holds. */
export function LinkRow({
  icon,
  title,
  line,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  line: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${line}`}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:bg-accent"
    >
      <Icon as={icon} className="size-5 text-muted-foreground" />
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">{title}</Text>
        <Text variant="muted">{line}</Text>
      </View>
      <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
    </Pressable>
  );
}
