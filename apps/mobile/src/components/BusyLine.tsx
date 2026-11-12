import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/ui/text';

/** A spinner and what is being waited on, read as one line by VoiceOver. */
export function BusyLine({ label }: { label: string }) {
  return (
    <View accessible accessibilityLabel={label} className="flex-row items-center gap-2">
      <ActivityIndicator />
      <Text className="text-muted-foreground">{label}</Text>
    </View>
  );
}
