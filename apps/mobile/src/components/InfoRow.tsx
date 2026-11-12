import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** One label and its value, on one line, or the value under the label when large text needs it. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    // One VoiceOver stop for the pair, not two.
    <View
      accessible
      className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
    >
      <Text className="text-muted-foreground">{label}</Text>
      <Text selectable numberOfLines={1} className="max-w-full font-mono text-sm">
        {value}
      </Text>
    </View>
  );
}
