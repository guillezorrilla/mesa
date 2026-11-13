import { MacsScreen } from '@/features/pairing/MacsScreen';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** Home: the paired Macs when there is one, else how to pair one. */
export default function Home() {
  const { pairing } = usePairing();
  return pairing ? <MacsScreen /> : <PairScreen />;
}
