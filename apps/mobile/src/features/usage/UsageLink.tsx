import { router } from 'expo-router';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** The Mac tab's way to Usage: what the sessions cost, by day and session, and their context. */
export function UsageLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Usage: cost by day and session, and context"
      onPress={() => router.push('/usage')}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:bg-accent"
    >
      <Icon as={ChartColumn} className="size-5 text-muted-foreground" />
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">Usage</Text>
        <Text variant="muted">Cost by day and session, and context</Text>
      </View>
      <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
    </Pressable>
  );
}
