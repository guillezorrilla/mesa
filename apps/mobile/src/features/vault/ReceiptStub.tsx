import type { PhoneSaved } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { StubLine } from './StubLine';
import { savedText } from './vaultText';

/** A saved decision as a torn-off stub: what it did, then its note and receipt, each opening. */
export function ReceiptStub({ saved }: { saved: PhoneSaved }) {
  return (
    <View
      accessibilityRole="alert"
      className="gap-3 rounded-xl border border-dashed border-state-done/60 bg-state-done/5 p-4"
    >
      <Text className="font-medium text-state-done">{savedText(saved)}</Text>
      <StubLine label="Note" path={saved.path} />
      {saved.receipt ? <StubLine label="Receipt" path={saved.receipt} /> : null}
    </View>
  );
}
