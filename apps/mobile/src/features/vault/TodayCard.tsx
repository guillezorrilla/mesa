import { router } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { calendarLeaf } from './vaultText';

/** Today as a calendar leaf beside what the day's digest holds; it opens the digest. */
export function TodayCard() {
  const leaf = calendarLeaf(new Date());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Today, ${leaf.weekday}: Daily, Impact and the Weekly Rewind`}
      onPress={() => router.push('/vault/today')}
      className="active:opacity-70"
    >
      <Card className="flex-row items-center gap-4 p-4">
        <View className="w-16 items-center overflow-hidden rounded-lg border border-border">
          <Text className="w-full bg-primary py-0.5 text-center font-mono text-xs font-semibold text-primary-foreground">
            {leaf.month}
          </Text>
          <Text className="py-1 font-mono text-2xl font-medium">{leaf.day}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-lg font-semibold">Today</Text>
          <Text variant="muted">Daily, Impact and the Weekly Rewind</Text>
        </View>
        <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
      </Card>
    </Pressable>
  );
}
