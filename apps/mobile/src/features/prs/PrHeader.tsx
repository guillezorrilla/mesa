import type { PhonePrDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChangeMeter } from '../changes/ChangeMeter';
import { prMeta } from './prText';

/** The PR's title, where and whose it is, its branch onto its base, and its size. */
export function PrHeader({ pr }: { pr: PhonePrDetail }) {
  return (
    <View className="gap-2">
      <Text selectable accessibilityRole="header" className="text-2xl font-semibold">
        {pr.title}
      </Text>
      <Text className="font-mono text-xs text-muted-foreground">{prMeta(pr)}</Text>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text numberOfLines={1} className="shrink font-mono text-xs">
          {pr.branch} → {pr.base}
        </Text>
        <ChangeMeter added={pr.additions} removed={pr.deletions} />
        <Text className="font-mono text-xs text-state-done">+{pr.additions}</Text>
        <Text className="font-mono text-xs text-destructive">-{pr.deletions}</Text>
      </View>
      {pr.state !== 'open' ? (
        <Text className="font-semibold text-muted-foreground">
          {pr.state === 'merged' ? 'Merged' : 'Closed'}
        </Text>
      ) : null}
    </View>
  );
}
