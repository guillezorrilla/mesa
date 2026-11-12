import BellRing from 'lucide-react-native/icons/bell-ring';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** A cost alert the Mac reached, in the waiting tone: worth a look, nothing stopped. */
export function CostAlert({ text }: { text: string }) {
  return (
    <View
      accessible
      accessibilityRole="alert"
      className="flex-row gap-3 rounded-xl border border-state-waiting/40 bg-state-waiting/10 p-4"
    >
      <Icon as={BellRing} className="mt-0.5 size-4 text-state-waiting" />
      <Text className="shrink">{text}</Text>
    </View>
  );
}
