import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** One label and its value, on one line. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-2">
      <Text className="text-muted-foreground">{label}</Text>
      <Text selectable numberOfLines={1} className="shrink font-mono text-sm">
        {value}
      </Text>
    </View>
  );
}
