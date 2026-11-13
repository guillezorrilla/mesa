import { money, type PhoneUsage } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** What made up a day's cost: its costliest models with theirs, under the chart as Screen Time lists a day's apps. */
export function DayModels({ models }: { models: PhoneUsage['days'][number]['models'] }) {
  if (!models.length) return null;
  return (
    <View className="gap-2 border-t border-border pt-3">
      {models.map(({ model, cost }) => (
        <View key={model} accessible className="flex-row items-center gap-3">
          <Text numberOfLines={1} className="flex-1 text-sm">
            {model}
          </Text>
          <Text className="font-mono text-sm text-muted-foreground">{money(cost)}</Text>
        </View>
      ))}
    </View>
  );
}
