import type { GateAdvice } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { adviceHeadline } from './adviceText';
import { OddsRow } from './OddsRow';

/** The Decision model's advice on a gate: its headline, then each option's odds and defer's. */
export function AdviceCard({ advice }: { advice: GateAdvice }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="font-medium">{adviceHeadline(advice)}</Text>
      {advice.odds.map((odds) => (
        <OddsRow
          key={odds.option}
          label={odds.option}
          p={odds.p}
          picked={odds.option === advice.pick}
        />
      ))}
      {advice.defer === undefined ? null : (
        <OddsRow label="Leave it to you" p={advice.defer} picked={!advice.pick} />
      )}
      {advice.model ? (
        <Text variant="muted">Advice only, from {advice.model}. You pick.</Text>
      ) : null}
    </View>
  );
}
