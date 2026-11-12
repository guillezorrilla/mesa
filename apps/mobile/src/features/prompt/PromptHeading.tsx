import { View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { CardTitle } from '@/components/ui/card';

/** A prompt card's heading, led by the waiting dot that marks the session in Needs you. */
export function PromptHeading({ title }: { title: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <StateDot color="bg-state-waiting" />
      <CardTitle className="shrink">{title}</CardTitle>
    </View>
  );
}
