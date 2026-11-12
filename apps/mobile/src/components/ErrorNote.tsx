import CircleAlert from 'lucide-react-native/icons/circle-alert';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** What went wrong and what to do, in the destructive colour, beside an alert icon. */
export function ErrorNote({ text }: { text: string }) {
  return (
    <View
      accessible
      accessibilityRole="alert"
      className="flex-row gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
    >
      <Icon as={CircleAlert} className="mt-0.5 size-5 text-destructive" />
      <Text className="shrink text-destructive">{text}</Text>
    </View>
  );
}
