import X from 'lucide-react-native/icons/x';
import { Image, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';

/** The photo attached to the reply, as a thumbnail with a corner button to take it off. */
export function PhotoChip({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View className="self-start">
      <Image
        source={{ uri }}
        className="size-16 rounded-lg border border-border"
        accessibilityLabel="Attached photo"
      />
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove the photo"
        hitSlop={12}
        className="absolute -top-2 -right-2 size-6 items-center justify-center rounded-full bg-foreground"
      >
        <Icon as={X} className="size-3.5 text-background" />
      </Pressable>
    </View>
  );
}
