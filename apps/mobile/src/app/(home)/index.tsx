import { Stack } from 'expo-router';
import { MacsScreen } from '@/features/pairing/MacsScreen';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** Settings: the paired Macs when there is one, else how to pair one, under Mesa's name. */
export default function Home() {
  const { pairing } = usePairing();
  if (pairing) return <MacsScreen />;
  return (
    <>
      <Stack.Screen options={{ title: 'Mesa' }} />
      <PairScreen />
    </>
  );
}
