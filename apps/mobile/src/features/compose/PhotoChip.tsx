import X from 'lucide-react-native/icons/x';
import { Image, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** The photo attached to the reply, with a way to take it off. */
export function PhotoChip({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View className="flex-row items-center gap-2">
      <Image source={{ uri }} className="size-12 rounded-md" accessibilityIgnoresInvertColors />
      <Text variant="muted" className="flex-1">
        Photo attached
      </Text>
      <Button size="icon" variant="ghost" onPress={onRemove} accessibilityLabel="Remove the photo">
        <Icon as={X} className="size-5 text-muted-foreground" />
      </Button>
    </View>
  );
}
