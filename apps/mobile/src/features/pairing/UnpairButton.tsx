import { Alert } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** Unpair one Mac, after iOS's own confirmation: that pairing ends here and on the broker. */
export function UnpairButton({ name, onUnpair }: { name: string; onUnpair: () => Promise<void> }) {
  const confirm = () =>
    Alert.alert(
      `Unpair from ${name}?`,
      'This phone stops getting its sessions and notices until you pair it again. Other Macs stay paired.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpair', style: 'destructive', onPress: () => void onUnpair() },
      ],
    );
  return (
    <Button size="sm" variant="ghost" onPress={confirm} accessibilityLabel={`Unpair ${name}`}>
      <Text className="text-destructive">Unpair</Text>
    </Button>
  );
}
