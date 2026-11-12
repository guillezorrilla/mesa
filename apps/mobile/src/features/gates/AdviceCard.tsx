import type { GateAdvice } from '@mesa/core/phone';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { adviceHeadline, percent } from './adviceText';

/** The Decision model's word on a gate: what it advises, what it leaves to you, and that you pick. */
export function AdviceCard({ advice }: { advice: GateAdvice }) {
  return (
    <View className="flex-row gap-3 rounded-xl bg-muted/60 p-4">
      <Icon as={Sparkles} className="mt-0.5 size-4 text-muted-foreground" />
      <View className="flex-1 gap-1">
        <Text className="font-medium">{adviceHeadline(advice)}</Text>
        {advice.defer === undefined ? null : (
          <Text variant="muted">Leave it to you: {percent(advice.defer)}</Text>
        )}
        {advice.model ? (
          <Text variant="muted">Advice only, from {advice.model}. You pick.</Text>
        ) : null}
      </View>
    </View>
  );
}
