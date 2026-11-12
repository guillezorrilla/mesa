import { Alert } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** Unpair, after iOS's own confirmation: the pairing ends here and on the broker. */
export function UnpairButton({ onUnpair }: { onUnpair: () => Promise<void> }) {
  const confirm = () =>
    Alert.alert(
      'Unpair from your Mac?',
      "This phone stops getting Mesa's notices until you pair it again.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpair', style: 'destructive', onPress: () => void onUnpair() },
      ],
    );
  return (
    <Button variant="ghost" onPress={confirm}>
      <Text className="text-destructive">Unpair</Text>
    </Button>
  );
}
