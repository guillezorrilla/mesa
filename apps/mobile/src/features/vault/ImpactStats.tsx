import type { PhoneToday } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { impactStats } from './vaultText';

/** Impact today: its sentence under three large counts, set in mono like a ledger's totals. */
export function ImpactStats({ impact }: { impact: PhoneToday['impact'] }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row">
        {impactStats(impact).map((stat) => (
          <View key={stat.label} accessible className="flex-1 gap-0.5">
            <Text className="font-mono text-3xl font-medium tracking-tight">{stat.value}</Text>
            <Text variant="muted">{stat.label}</Text>
          </View>
        ))}
      </View>
      <Text selectable className="leading-6">
        {impact.sentence}
      </Text>
    </View>
  );
}
