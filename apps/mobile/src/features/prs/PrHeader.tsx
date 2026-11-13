import type { PhonePrDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { prMeta } from './prText';

/** The PR's title, where and whose it is, and its branch onto its base. */
export function PrHeader({ pr }: { pr: PhonePrDetail }) {
  return (
    <View className="gap-2">
      <Text selectable accessibilityRole="header" className="text-2xl font-semibold">
        {pr.title}
      </Text>
      <Text className="font-mono text-xs text-muted-foreground">{prMeta(pr)}</Text>
      <Text numberOfLines={1} className="font-mono text-xs">
        {pr.branch} → {pr.base}
      </Text>
      {pr.state !== 'open' ? (
        <Text className="font-semibold text-muted-foreground">
          {pr.state === 'merged' ? 'Merged' : 'Closed'}
        </Text>
      ) : null}
    </View>
  );
}
